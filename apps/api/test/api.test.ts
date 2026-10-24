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

  it('conta nova: GET /me dá 404 até o cadastro; POST /me cadastra com o e-mail do Cognito e com Player ID já pode agir', async () => {
    const { call } = setup();
    expect(await call('GET', '/me', 'ana-email:s1')).toMatchObject({ status: 404, body: { error: 'account_not_found' } });
    const created = await call('POST', '/me', 'ana-email:s1', { profile, playerId: '100001', email: 'forjado@example.com' });
    expect(created).toMatchObject({
      status: 201,
      body: { email: 'ana@example.com', role: 'player', canAct: true, playerId: '100001' },
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

  it('Google depois da senha: mesma conta, e o login por senha (e-mail não provado) perde o acesso', async () => {
    const { call } = setup();
    const id = await register(call, 'ana-email:celular1');
    expect(await call('GET', '/me', 'ana-google:celular1g')).toMatchObject({ status: 401, body: { error: 'session_inactive' } });
    expect(await call('POST', '/session', 'ana-google:celular1g', { replace: true })).toMatchObject({ status: 200, body: { id } });
    expect(await call('GET', '/me', 'ana-email:celular1')).toMatchObject({ status: 409, body: { error: 'account_exists' } });
  });

  it('senha depois do Google no mesmo e-mail: 409 com orientação', async () => {
    const { call } = setup();
    await register(call, 'ana-google:g1');
    const res = await call('GET', '/me', 'ana-senha:s1');
    expect(res).toMatchObject({ status: 409, body: { error: 'account_exists' } });
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

  it('Player ID em uso no cadastro: 409 com a mensagem', async () => {
    const { call } = setup();
    await register(call, 'ana-email:p1', '100001');
    expect(await call('POST', '/me', 'adm:a1', { profile, playerId: '100001' })).toMatchObject({
      status: 409, body: { error: 'player_id_taken', message: 'Esse Player ID já está em uso, procure o ADM' },
    });
    expect((await call('GET', '/me', 'adm:a1')).status).toBe(404);
  });

  it('conta sem Player ID informa depois; de novo dá 409', async () => {
    const { call } = setup();
    await register(call, 'ana-email:p1');
    expect(await call('GET', '/me', 'ana-email:p1')).toMatchObject({ body: { canAct: false, playerId: null } });
    expect(await call('POST', '/me/player-id', 'ana-email:p1', { playerId: '100001' })).toMatchObject({
      status: 200, body: { canAct: true, playerId: '100001' },
    });
    expect(await call('POST', '/me/player-id', 'ana-email:p1', { playerId: '100002' })).toMatchObject({ status: 409, body: { error: 'player_id_set' } });
    expect((await call('POST', '/me/player-id', 'ana-email:p1', {})).status).toBe(400);
  });

  it('ADM busca e desfaz o vínculo; jogador recebe 403', async () => {
    const { call } = setup();
    await register(call, 'ana-email:p1', '100001');
    await register(call, 'adm:a1');
    expect(await call('GET', '/player-ids/100001', 'adm:a1:admin')).toMatchObject({ status: 200, body: { profile: { name: 'Ana Souza' }, playerId: '100001' } });
    expect((await call('GET', '/player-ids/100001', 'ana-email:p1')).status).toBe(403);
    expect((await call('POST', '/player-ids/100001/unlink', 'ana-email:p1')).status).toBe(403);
    expect(await call('GET', '/player-ids/999999', 'adm:a1:admin')).toMatchObject({ status: 404, body: { error: 'account_not_found' } });
    expect(await call('POST', '/player-ids/100001/unlink', 'adm:a1:admin')).toMatchObject({ status: 200, body: { playerId: null } });
    expect(await call('GET', '/me', 'ana-email:p1')).toMatchObject({ body: { canAct: false, playerId: null } });
  });

  it('rotas antigas de check-in não existem mais; Player ID malformado não casa rota', async () => {
    const { call } = setup();
    await register(call, 'adm:a1');
    expect(await call('GET', `/accounts/${randomUUID()}`, 'adm:a1:admin')).toMatchObject({ status: 404, body: { error: 'not_found' } });
    expect((await call('POST', `/accounts/${randomUUID()}/player-id`, 'adm:a1:admin', { playerId: '1' })).status).toBe(404);
    expect(await call('GET', '/player-ids/../me', 'adm:a1:admin')).toMatchObject({ status: 404, body: { error: 'not_found' } });
  });

  it('erro inesperado vira 500 genérico e é registrado', async () => {
    const { call, accounts, errors } = setup();
    accounts.authenticate = () => Promise.reject(new Error('DynamoDB fora do ar'));
    expect(await call('GET', '/me', 'ana-email:s1')).toMatchObject({ status: 500, body: { error: 'internal' } });
    expect(errors).toHaveLength(1);
  });
});
