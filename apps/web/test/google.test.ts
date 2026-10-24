import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createGoogle } from '../src/auth/google.js';

const config = {
  loginDomain: 'https://ggtcg-login.auth.us-east-2.amazoncognito.com',
  clientId: 'cliente',
  redirectUri: 'https://site.example/',
};

const memory = () => {
  const store = { value: null as string | null, get: () => store.value, set: (v: string) => { store.value = v; }, clear: () => { store.value = null; } };
  return store;
};

/** Bytes previsíveis: o teste confere o desafio a partir do verifier salvo. */
const random = () => new Uint8Array(32).map((_, i) => i);

const setup = (reply: Record<string, unknown> = { access_token: 'acesso', refresh_token: 'renovacao', expires_in: 900 }) => {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchFn = ((url: string, init: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve(new Response(JSON.stringify(reply), { status: 200 }));
  }) as typeof fetch;
  const store = memory();
  const google = createGoogle(config, { fetchFn, store, random, now: () => 0 });
  return { calls, store, google };
};

const saved = (store: ReturnType<typeof memory>) => JSON.parse(store.value ?? '{}') as { verifier: string; state: string };

describe('entrar com o Google', () => {
  it('URL de autorização com PKCE (S256), escopo de admin e o Google direto', async () => {
    const { store, google } = setup();
    const url = new URL(await google.authorizeUrl());
    const { verifier, state } = saved(store);
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(url.origin + url.pathname).toBe(`${config.loginDomain}/oauth2/authorize`);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      identity_provider: 'Google',
      response_type: 'code',
      client_id: 'cliente',
      redirect_uri: 'https://site.example/',
      scope: 'openid email aws.cognito.signin.user.admin',
      state,
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256',
    });
  });

  it('na volta, troca o código pelo token com o verifier salvo', async () => {
    const { calls, store, google } = setup();
    await google.authorizeUrl();
    const { verifier, state } = saved(store);
    expect(await google.finish(`?code=abc&state=${state}`)).toEqual({ access: 'acesso', refresh: 'renovacao', expiresAt: 900_000 });
    expect(calls[0]?.url).toBe(`${config.loginDomain}/oauth2/token`);
    expect((calls[0]?.init.headers as Record<string, string>)['Content-Type']).toBe('application/x-www-form-urlencoded');
    expect(Object.fromEntries(new URLSearchParams(calls[0]?.init.body as string))).toEqual({
      grant_type: 'authorization_code', client_id: 'cliente', code: 'abc', redirect_uri: 'https://site.example/', code_verifier: verifier,
    });
    expect(store.value).toBeNull();
  });

  it('cancelado no Google: mensagem, sem chamar o Cognito', async () => {
    const { calls, store, google } = setup();
    await google.authorizeUrl();
    expect(await google.finish('?error=access_denied&state=x')).toEqual({ error: 'Entrada pelo Google cancelada.' });
    expect(calls).toHaveLength(0);
    expect(store.value).toBeNull();
  });

  it('outro erro do Cognito: mostra o motivo para dar para diagnosticar', async () => {
    const { calls, google } = setup();
    await google.authorizeUrl();
    expect(await google.finish('?error_description=Invalid+ProviderName%2FUsername+combination.+&state=x&error=invalid_request'))
      .toEqual({ error: 'Não foi possível entrar pelo Google. Tente de novo. (Invalid ProviderName/Username combination.)' });
    expect(await google.finish('?error=server_error')).toEqual({ error: 'Não foi possível entrar pelo Google. Tente de novo. (server_error)' });
    expect(calls).toHaveLength(0);
  });

  it('state diferente do salvo ou nada salvo: recusa sem trocar o código', async () => {
    const { calls, store, google } = setup();
    await google.authorizeUrl();
    const failure = { error: 'Não foi possível entrar pelo Google. Tente de novo.' };
    expect(await google.finish('?code=abc&state=outro')).toEqual(failure);
    expect(store.value).toBeNull();
    expect(await google.finish('?code=abc&state=outro')).toEqual(failure);
    expect(calls).toHaveLength(0);
  });

  it('URL sem retorno do Google: nada a fazer', async () => {
    expect(await setup().google.finish('')).toBeNull();
    expect(await setup().google.finish('?demo')).toBeNull();
  });

  it('Cognito recusa o código: mensagem de falha', async () => {
    const { store, google } = setup({ error: 'invalid_grant' });
    await google.authorizeUrl();
    expect(await google.finish(`?code=abc&state=${saved(store).state}`)).toEqual({ error: 'Não foi possível entrar pelo Google. Tente de novo.' });
  });
});
