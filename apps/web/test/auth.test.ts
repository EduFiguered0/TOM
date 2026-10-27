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

const failure = (type: string) => ({ status: 400, body: { __type: `com.amazon#${type}`, message: type } });
const messageOf = async (promise: Promise<unknown>) => {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(AuthError);
  return (error as AuthError).message;
};

describe('login com e-mail e senha', () => {
  it('cadastro: cria com senha e já entra, sem código', async () => {
    const { calls, fetchFn } = fakeCognito({ SignUp: { body: { UserConfirmed: true } }, InitiateAuth: auth('acesso', 'renovacao') });
    expect(await createCognito(config, fetchFn, () => 0).signUp(' Ana@Example.COM ', 'senha123'))
      .toEqual({ access: 'acesso', refresh: 'renovacao', expiresAt: 900_000 });
    expect(calls.map((c) => c.action)).toEqual(['SignUp', 'InitiateAuth']);
    expect(calls[0]?.body).toMatchObject({ Username: 'ana@example.com', Password: 'senha123' });
    expect(calls[1]?.body).toMatchObject({
      AuthFlow: 'USER_AUTH', AuthParameters: { USERNAME: 'ana@example.com', PASSWORD: 'senha123', PREFERRED_CHALLENGE: 'PASSWORD' },
    });
  });

  const WRONG = 'E-mail ou senha incorretos. Conta antiga ou senha esquecida? Use "Esqueci minha senha".';

  it('entrar: senha errada orienta para o "Esqueci minha senha"', async () => {
    const { fetchFn } = fakeCognito({ InitiateAuth: failure('NotAuthorizedException') });
    expect(await messageOf(createCognito(config, fetchFn).signIn('ana@example.com', 'errada1'))).toBe(WRONG);
  });

  it('conta antiga sem senha: o Cognito pede outro desafio, e a mensagem leva ao "Esqueci minha senha"', async () => {
    const { fetchFn } = fakeCognito({ InitiateAuth: { body: { ChallengeName: 'SELECT_CHALLENGE', Session: 's', AvailableChallenges: [] } } });
    expect(await messageOf(createCognito(config, fetchFn).signIn('antiga@example.com', 'qualquer1'))).toBe(WRONG);
  });

  it('senha fraca no cadastro vira mensagem e não tenta entrar', async () => {
    const { calls, fetchFn } = fakeCognito({ SignUp: failure('InvalidPasswordException') });
    expect(await messageOf(createCognito(config, fetchFn).signUp('ana@example.com', 'abc')))
      .toBe('A senha precisa ter pelo menos 8 caracteres, com uma letra minúscula e um número.');
    expect(calls.map((c) => c.action)).toEqual(['SignUp']);
  });

  it('e-mail que já tem conta vira orientação', async () => {
    const { fetchFn } = fakeCognito({ SignUp: failure('UsernameExistsException') });
    expect(await messageOf(createCognito(config, fetchFn).signUp('ana@example.com', 'senha123')))
      .toBe('Esse e-mail já tem conta. Entre com a sua senha ou pelo Google.');
  });

  it('esqueci a senha: pede o código e redefine com o código só em dígitos', async () => {
    const { calls, fetchFn } = fakeCognito({ ForgotPassword: { body: {} }, ConfirmForgotPassword: { body: {} } });
    const cognito = createCognito(config, fetchFn);
    await cognito.forgotPassword(' Ana@Example.com');
    await cognito.resetPassword('Ana@Example.com', '123 456', 'nova1234');
    expect(calls).toMatchObject([
      { action: 'ForgotPassword', body: { Username: 'ana@example.com' } },
      { action: 'ConfirmForgotPassword', body: { Username: 'ana@example.com', ConfirmationCode: '123456', Password: 'nova1234' } },
    ]);
  });

  it('código errado na redefinição vira mensagem em português', async () => {
    const { fetchFn } = fakeCognito({ ConfirmForgotPassword: failure('CodeMismatchException') });
    expect(await messageOf(createCognito(config, fetchFn).resetPassword('a@b.c', '000000', 'nova1234'))).toMatch(/Código incorreto/);
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

  it('falha de rede na renovação não desloga: lança e tenta de novo depois', async () => {
    const fetchFn = (() => Promise.reject(new TypeError('Failed to fetch'))) as unknown as typeof fetch;
    const storage = memory();
    storage.set(JSON.stringify({ access: 'velho', refresh: 'bom', expiresAt: 0 }));
    const session = createSession(createCognito(config, fetchFn), storage, () => 1);
    await expect(session.accessToken()).rejects.toThrow();
    expect(session.loggedIn).toBe(true);
    expect(storage.value).not.toBeNull();
  });

  it('sem login nesta aba, aproveita o login feito em outra aba (mesmo armazenamento)', async () => {
    const { fetchFn } = fakeCognito({});
    const storage = memory();
    const session = createSession(createCognito(config, fetchFn), storage, () => 1);
    expect(await session.accessToken()).toBeNull();
    storage.set(JSON.stringify({ access: 'da-outra-aba', refresh: 'r', expiresAt: 900_000 }));
    expect(await session.accessToken()).toBe('da-outra-aba');
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
