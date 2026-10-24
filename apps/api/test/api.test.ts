import { AccountService, InMemoryAccountRepository, type Identity } from '@tom/core';
import { describe, expect, it } from 'vitest';
import { createApi, type HttpRequest } from '../src/index.js';

/** Token falso "conta:sessão:grupo1,grupo2"; "expirado" é recusado. */
const tokens = {
  verify: (token: string): Promise<Identity> => {
    if (token === 'expirado') return Promise.reject(new Error('expirado'));
    const [accountId = '', session = '', groups = ''] = token.split(':');
    return Promise.resolve({ accountId, session, groups: groups ? groups.split(',') : [] });
  },
};

const setup = () => {
  const errors: unknown[] = [];
  let n = 0;
  const accounts = new AccountService({
    accounts: new InMemoryAccountRepository(),
    clock: { now: () => new Date('2026-10-23T14:00:00Z') },
    ids: { next: () => `i${String(++n)}` },
  });
  const api = createApi({
    tokens,
    emails: { verifiedEmail: () => Promise.resolve('ana@example.com') },
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

describe('API', () => {
  it('sem token, token inválido ou rota desconhecida', async () => {
    const { call } = setup();
    expect((await call('GET', '/me', null)).status).toBe(401);
    expect((await call('GET', '/me', 'expirado')).status).toBe(401);
    expect((await call('DELETE', '/me', 'c1:s1')).status).toBe(404);
  });

  it('conta nova: GET /me dá 404 até o cadastro; POST /me cadastra com o e-mail do Cognito', async () => {
    const { call } = setup();
    expect(await call('GET', '/me', 'c1:s1')).toMatchObject({ status: 404, body: { error: 'account_not_found' } });
    const created = await call('POST', '/me', 'c1:s1', { profile, playerId: '100001', email: 'forjado@example.com' });
    expect(created).toMatchObject({
      status: 201,
      body: { id: 'c1', email: 'ana@example.com', role: 'player', canAct: false, playerId: { value: '100001', confirmed: false } },
    });
    expect((await call('GET', '/me', 'c1:s1')).status).toBe(200);
  });

  it('cadastro inválido ou repetido', async () => {
    const { call } = setup();
    expect((await call('POST', '/me', 'c1:s1', { profile: { ...profile, birthYear: 2015 }, playerId: null })).status).toBe(400);
    expect((await call('POST', '/me', 'c1:s1', { profile })).status).toBe(400);
    await call('POST', '/me', 'c1:s1', { profile, playerId: null });
    expect((await call('POST', '/me', 'c1:s1', { profile, playerId: null })).status).toBe(409);
  });

  it('troca de dispositivo: 409 sem confirmação; com confirmação o anterior passa a receber 401', async () => {
    const { call } = setup();
    await call('POST', '/me', 'c1:celular1', { profile, playerId: null });
    expect(await call('GET', '/me', 'c1:celular2')).toMatchObject({ status: 401, body: { error: 'session_inactive' } });
    expect(await call('POST', '/session', 'c1:celular2', { replace: false })).toMatchObject({ status: 409, body: { error: 'session_conflict' } });
    expect((await call('POST', '/session', 'c1:celular2', { replace: true })).status).toBe(200);
    expect((await call('GET', '/me', 'c1:celular1')).status).toBe(401);
    expect((await call('GET', '/me', 'c1:celular2')).status).toBe(200);
  });

  it('grupo do Cognito define o papel', async () => {
    const { call } = setup();
    await call('POST', '/me', 'c1:s1', { profile, playerId: null });
    expect(await call('GET', '/me', 'c1:s1:admin')).toMatchObject({ body: { role: 'admin', canAct: true } });
  });

  it('erro inesperado vira 500 genérico e é registrado', async () => {
    const { call, accounts, errors } = setup();
    accounts.authenticate = () => Promise.reject(new Error('DynamoDB fora do ar'));
    expect(await call('GET', '/me', 'c1:s1')).toMatchObject({ status: 500, body: { error: 'internal' } });
    expect(errors).toHaveLength(1);
  });
});
