import { describe, expect, it } from 'vitest';
import { AuthError, createCognito } from '../src/auth/cognito.js';
import { createSession, type Storage } from '../src/auth/session.js';

type Reply = { status?: number; body: Record<string, unknown> };

/** Cognito falso: responde por ação (X-Amz-Target) e registra as chamadas. */
const fakeCognito = (replies: Record<string, Reply | Reply[]>) => {
  const calls: { action: string; body: Record<string, unknown> }[] = [];
  const fetchFn = ((_url: string, init: RequestInit) => {
    const action = String((init.headers as Record<string, string>)['X-Amz-Target']).split('.').pop() ?? '';
    calls.push({ action, body: JSON.parse(init.body as string) as Record<string, unknown> });
    const entry = replies[action];
    const reply = Array.isArray(entry) ? entry.shift() : entry;
    if (!reply) throw new Error(`ação inesperada ${action}`);
    return Promise.resolve(new Response(JSON.stringify(reply.body), { status: reply.status ?? 200 }));
  }) as typeof fetch;
  return { calls, fetchFn };
};

const auth = (access: string, refresh?: string) => ({ body: { AuthenticationResult: { AccessToken: access, RefreshToken: refresh, ExpiresIn: 900 } } });
const config = { region: 'us-east-2', clientId: 'cliente' };

describe('login sem senha', () => {
  it('primeira vez: cria a conta, confirma o código e já entra', async () => {
    const { calls, fetchFn } = fakeCognito({
      SignUp: { body: { Session: 's1' } },
      ConfirmSignUp: { body: { Session: 's2' } },
      InitiateAuth: auth('acesso', 'renovacao'),
    });
    const cognito = createCognito(config, fetchFn, () => 0);
    const pending = await cognito.start('  Ana@Example.COM ');
    expect(pending).toEqual({ kind: 'signup', email: 'ana@example.com', session: 's1' });
    expect(await cognito.verify(pending, '123 456')).toEqual({ access: 'acesso', refresh: 'renovacao', expiresAt: 900_000 });
    expect(calls.map((c) => c.action)).toEqual(['SignUp', 'ConfirmSignUp', 'InitiateAuth']);
    expect(calls[1]?.body).toMatchObject({ ConfirmationCode: '123456', Session: 's1' });
    expect(calls[0]?.body).not.toHaveProperty('Password');
  });

  it('já cadastrado: pede o código de login e responde o desafio', async () => {
    const { calls, fetchFn } = fakeCognito({
      SignUp: { status: 400, body: { __type: 'UsernameExistsException', message: 'existe' } },
      InitiateAuth: { body: { Session: 's1', ChallengeName: 'EMAIL_OTP' } },
      RespondToAuthChallenge: auth('acesso', 'renovacao'),
    });
    const cognito = createCognito(config, fetchFn);
    const pending = await cognito.start('ana@example.com');
    expect(pending.kind).toBe('signin');
    await cognito.verify(pending, '654321');
    expect(calls[1]?.body).toMatchObject({ AuthFlow: 'USER_AUTH', AuthParameters: { PREFERRED_CHALLENGE: 'EMAIL_OTP' } });
    expect(calls[2]?.body).toMatchObject({ ChallengeResponses: { EMAIL_OTP_CODE: '654321' } });
  });

  it('código errado vira mensagem em português', async () => {
    const { fetchFn } = fakeCognito({
      RespondToAuthChallenge: { status: 400, body: { __type: 'com.amazon#CodeMismatchException', message: 'Invalid code' } },
    });
    const error = await createCognito(config, fetchFn).verify({ kind: 'signin', email: 'a@b.c', session: 's' }, '000000').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AuthError);
    expect((error as AuthError).message).toMatch(/Código incorreto/);
  });
});

describe('sessão do dispositivo', () => {
  const memory = (): Storage & { value: string | null } => {
    const store = { value: null as string | null, get: () => store.value, set: (v: string) => { store.value = v; }, clear: () => { store.value = null; } };
    return store;
  };

  it('guarda o login, renova o token perto de expirar (mantendo o de renovação) e sai revogando', async () => {
    const { calls, fetchFn } = fakeCognito({ InitiateAuth: auth('acesso-2'), RevokeToken: { body: {} } });
    let now = 0;
    const storage = memory();
    const session = createSession(createCognito(config, fetchFn, () => now), storage, () => now);
    session.signedIn({ access: 'acesso-1', refresh: 'renovacao', expiresAt: 900_000 });

    expect(await session.accessToken()).toBe('acesso-1');
    now = 850_000;
    expect(await session.accessToken()).toBe('acesso-2');
    expect(JSON.parse(storage.value ?? '{}')).toMatchObject({ access: 'acesso-2', refresh: 'renovacao' });

    await session.signOut();
    expect(session.loggedIn).toBe(false);
    expect(storage.value).toBeNull();
    expect(calls.at(-1)).toMatchObject({ action: 'RevokeToken', body: { Token: 'renovacao' } });
  });

  it('renovação recusada (revogada ou expirada) desloga', async () => {
    const { fetchFn } = fakeCognito({ InitiateAuth: { status: 400, body: { __type: 'NotAuthorizedException' } } });
    const storage = memory();
    storage.set(JSON.stringify({ access: 'velho', refresh: 'revogado', expiresAt: 0 }));
    const session = createSession(createCognito(config, fetchFn), storage, () => 1);
    expect(session.loggedIn).toBe(true);
    expect(await session.accessToken()).toBeNull();
    expect(session.loggedIn).toBe(false);
  });
});
