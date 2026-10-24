import type { AccountResponse, MeResponse } from '@tom/contracts';
import { describe, expect, it } from 'vitest';
import { register, setup, setupRound } from './support.js';

const ADM = 'adm:a1:admin';

const team = async () => {
  const ctx = setup();
  await register(ctx.call, 'adm:a1');
  const joao = await register(ctx.call, 'ana-email:j1', '100001');
  return { ...ctx, joao };
};

describe('equipe', () => {
  it('ADM busca, marca juiz e lista a equipe; jogador recebe 403', async () => {
    const { call, joao } = await team();
    const found = await call('POST', '/staff/search', ADM, { query: '100001' });
    expect(found).toMatchObject({ status: 200, body: [{ id: joao, judge: false, playerId: '100001' }] });
    expect(await call('POST', `/staff/accounts/${joao}/judge`, ADM, { judge: true })).toMatchObject({ status: 200, body: { judge: true } });
    expect((await call('GET', '/staff/judges', ADM)).body as AccountResponse[]).toEqual([expect.objectContaining({ id: joao })]);
    expect((await call('POST', '/staff/search', 'ana-email:j1', { query: 'ana' })).status).toBe(403);
    expect((await call('GET', '/staff/judges', 'ana-email:j1')).status).toBe(403);
    expect((await call('POST', `/staff/accounts/${joao}/judge`, 'ana-email:j1', { judge: true })).status).toBe(403);
    expect((await call('POST', '/staff/search', ADM, {})).status).toBe(400);
  });

  it('marcar juiz sem Player ID dá 400 com a mensagem', async () => {
    const { call } = setup();
    await register(call, 'adm:a1');
    const semId = await register(call, 'ana-email:s1');
    expect(await call('POST', `/staff/accounts/${semId}/judge`, ADM, { judge: true })).toMatchObject({
      status: 400, body: { message: 'O juiz precisa ter Player ID cadastrado' },
    });
  });

  it('escala só aceita juiz da equipe', async () => {
    const { call, joao } = await team();
    expect(await call('POST', '/events', ADM, { label: 'Liga', judges: [joao] })).toMatchObject({
      status: 400, body: { message: 'Só juízes da equipe podem ser escalados' },
    });
    const created = await call('POST', '/events', ADM, { label: 'Liga' });
    const id = (created.body as { id: string }).id;
    await call('POST', `/staff/accounts/${joao}/judge`, ADM, { judge: true });
    expect(await call('PUT', `/events/${id}/judges`, ADM, { judges: [joao] })).toMatchObject({ status: 200, body: { id, judges: [joao] } });
    expect((await call('PUT', `/events/${id}/judges`, 'ana-email:j1', { judges: [] })).status).toBe(403);
    expect((await call('PUT', `/events/${id}/judges`, ADM, { judges: 'x' })).status).toBe(400);
  });

  it('GET /me mostra judge e judging', async () => {
    const ctx = await setupRound();
    const juiz = await register(ctx.call, 'juiz:j1', '100050');
    await ctx.call('POST', `/staff/accounts/${juiz}/judge`, ADM, { judge: true });
    const me = async () => (await ctx.call('GET', '/me', 'juiz:j1')).body as MeResponse;
    expect(await me()).toMatchObject({ role: 'player', judge: true, judging: false });
    await ctx.call('PUT', `/events/${ctx.eventId}/judges`, ADM, { judges: [juiz] });
    expect(await me()).toMatchObject({ judge: true, judging: true });
    expect((await ctx.call('GET', '/me', ADM)).body as MeResponse).toMatchObject({ role: 'admin', judge: false, judging: false });
  });
});
