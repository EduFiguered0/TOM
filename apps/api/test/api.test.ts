import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { profile, register, setup } from './support.js';

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
