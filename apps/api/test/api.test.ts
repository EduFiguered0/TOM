import { AccountService, InMemoryAccountRepository, type Identity } from '@tom/core';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createApi, type HttpRequest } from '../src/index.js';

/** Token falso "login:sessão:grupo1,grupo2"; "expirado" é recusado. */
const tokens = {
  verify: (token: string): Promise<Identity> => {
    if (token === 'expirado') return Promise.reject(new Error('expirado'));
    const [login = '', session = '', groups = ''] = token.split(':');
    return Promise.resolve({ login, session, groups: groups ? groups.split(',') : [] });
  },
};

/** E-mail verificado de cada login no "Cognito"; os dois logins da Ana têm o mesmo e-mail. */
const EMAILS: Record<string, string> = { 'ana-email': 'ana@example.com', 'ana-google': 'Ana@Example.com', adm: 'adm@example.com' };

const setup = () => {
  const errors: unknown[] = [];
  const accounts = new AccountService({
    accounts: new InMemoryAccountRepository(),
    clock: { now: () => new Date('2026-10-23T14:00:00Z') },
    ids: { next: () => randomUUID() },
  });
  const api = createApi({
    tokens,
    emails: { verifiedEmail: (token) => Promise.resolve(EMAILS[token.split(':')[0] ?? ''] ?? 'sem-conta@example.com') },
    accounts,
    logError: (e) => errors.push(e),
  });
  const call = (method: string, path: string, token: string | null, body?: unknown) =>
    api({
      method,
      path,
      headers: token ? { authorization: `Bearer ${token}` } : {},
      body: body === undefined ? null : JSON.stringify(body),
    } satisfies HttpRequest);
  return { call, accounts, errors };
};

const profile = { name: 'Ana Souza', birthYear: 1990, phone: null, guardianConsent: false };

/** Cadastra e devolve o id da conta. */
const register = async (call: ReturnType<typeof setup>['call'], token: string, playerId: string | null = null) =>
  ((await call('POST', '/me', token, { profile, playerId })).body as { id: string }).id;

describe('API', () => {
  it('sem token, token inválido ou rota desconhecida', async () => {
    const { call } = setup();
    expect((await call('GET', '/me', null)).status).toBe(401);
    expect((await call('GET', '/me', 'expirado')).status).toBe(401);
    expect((await call('DELETE', '/me', 'ana-email:s1')).status).toBe(404);
  });

  it('conta nova: GET /me dá 404 até o cadastro; POST /me cadastra com o e-mail do Cognito', async () => {
    const { call } = setup();
    expect(await call('GET', '/me', 'ana-email:s1')).toMatchObject({ status: 404, body: { error: 'account_not_found' } });
    const created = await call('POST', '/me', 'ana-email:s1', { profile, playerId: '100001', email: 'forjado@example.com' });
    expect(created).toMatchObject({
      status: 201,
      body: { email: 'ana@example.com', role: 'player', canAct: false, playerId: { value: '100001', confirmed: false } },
    });
    expect((await call('GET', '/me', 'ana-email:s1')).status).toBe(200);
  });

  it('cadastro inválido ou repetido', async () => {
    const { call } = setup();
    expect((await call('POST', '/me', 'ana-email:s1', { profile: { ...profile, birthYear: 2015 }, playerId: null })).status).toBe(400);
    expect((await call('POST', '/me', 'ana-email:s1', { profile })).status).toBe(400);
    await register(call, 'ana-email:s1');
    expect((await call('POST', '/me', 'ana-email:s1', { profile, playerId: null })).status).toBe(409);
  });

  it('troca de dispositivo: 409 sem confirmação; com confirmação o anterior passa a receber 401', async () => {
    const { call } = setup();
    await register(call, 'ana-email:celular1');
    expect(await call('GET', '/me', 'ana-email:celular2')).toMatchObject({ status: 401, body: { error: 'session_inactive' } });
    expect(await call('POST', '/session', 'ana-email:celular2', { replace: false })).toMatchObject({ status: 409, body: { error: 'session_conflict' } });
    expect((await call('POST', '/session', 'ana-email:celular2', { replace: true })).status).toBe(200);
    expect((await call('GET', '/me', 'ana-email:celular1')).status).toBe(401);
    expect((await call('GET', '/me', 'ana-email:celular2')).status).toBe(200);
  });

  it('Google depois do código por e-mail: mesma conta, ligada pelo e-mail verificado', async () => {
    const { call } = setup();
    const id = await register(call, 'ana-email:celular1');
    expect(await call('GET', '/me', 'ana-google:celular1g')).toMatchObject({ status: 401, body: { error: 'session_inactive' } });
    expect(await call('POST', '/session', 'ana-google:celular1g', { replace: true })).toMatchObject({ status: 200, body: { id } });
    expect((await call('GET', '/me', 'ana-email:celular1')).status).toBe(401);
  });

  it('login novo sem conta com o mesmo e-mail continua em 404 (vai para o cadastro)', async () => {
    const { call } = setup();
    await register(call, 'ana-email:s1');
    expect(await call('GET', '/me', 'outro:s9')).toMatchObject({ status: 404, body: { error: 'account_not_found' } });
  });

  it('grupo do Cognito define o papel', async () => {
    const { call } = setup();
    await register(call, 'ana-email:s1');
    expect(await call('GET', '/me', 'ana-email:s1:admin')).toMatchObject({ body: { role: 'admin', canAct: true } });
  });

  it('check-in: ADM consulta a conta e confirma o Player ID; o jogador passa a agir', async () => {
    const { call } = setup();
    const player = await register(call, 'ana-email:p1', '100009');
    await register(call, 'adm:a1');

    expect(await call('GET', `/accounts/${player}`, 'adm:a1:admin')).toMatchObject({
      status: 200, body: { id: player, playerId: { value: '100009', confirmed: false } },
    });
    expect(await call('POST', `/accounts/${player}/player-id`, 'adm:a1:admin', { playerId: '100001' })).toMatchObject({
      status: 200, body: { playerId: { value: '100001', confirmed: true } },
    });
    expect(await call('GET', '/me', 'ana-email:p1')).toMatchObject({ body: { canAct: true } });
  });

  it('rotas do ADM: jogador e juiz recebem 403; conta inexistente 404; id malformado não casa rota', async () => {
    const { call } = setup();
    const player = await register(call, 'ana-email:p1', '100001');
    expect((await call('GET', `/accounts/${player}`, 'ana-email:p1')).status).toBe(403);
    expect((await call('POST', `/accounts/${player}/player-id`, 'ana-email:p1:judge', { playerId: '100001' })).status).toBe(403);
    expect((await call('GET', `/accounts/${randomUUID()}`, 'ana-email:p1:admin')).status).toBe(404);
    expect((await call('GET', '/accounts/../me', 'ana-email:p1:admin')).status).toBe(404);
  });

  it('erro inesperado vira 500 genérico e é registrado', async () => {
    const { call, accounts, errors } = setup();
    accounts.authenticate = () => Promise.reject(new Error('DynamoDB fora do ar'));
    expect(await call('GET', '/me', 'ana-email:s1')).toMatchObject({ status: 500, body: { error: 'internal' } });
    expect(errors).toHaveLength(1);
  });
});
