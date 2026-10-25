import type { ActiveEventResponse, BoardResponse, MyEventResponse } from '@tom/contracts';
import { describe, expect, it } from 'vitest';
import { register, setup, setupRound, upload } from './support.js';

const ADM = 'adm:a1:admin';

const board = async (call: ReturnType<typeof setup>['call']) => {
  const response = await call('GET', '/board', null);
  expect(response.status).toBe(200);
  return response.body as BoardResponse;
};

describe('quadro da TV por fase do evento', () => {
  it('sem evento: tela de espera', async () => {
    const { call } = setup();
    expect(await board(call)).toMatchObject({ state: 'idle', serverTime: expect.any(String) as unknown });
  });

  it('inscrições abertas: QR (código) e inscritos ao vivo', async () => {
    const ctx = await setupRound();
    const active = ((await ctx.call('GET', '/events/active', ADM)).body as ActiveEventResponse).event;
    await ctx.call('POST', `/join/${active?.code ?? ''}`, 'p1:c1');
    expect(await board(ctx.call)).toMatchObject({ state: 'open', event: { label: 'Liga de Outubro' }, code: active?.code, registered: 1 });
  });

  it('sem QR depois de pedir a confirmação; contador de confirmados', async () => {
    const ctx = await setupRound();
    const active = ((await ctx.call('GET', '/events/active', ADM)).body as ActiveEventResponse).event;
    await ctx.call('POST', `/join/${active?.code ?? ''}`, 'p1:c1');
    await ctx.call('POST', `/join/${active?.code ?? ''}`, 'p2:c2');
    await ctx.call('POST', `/events/${ctx.eventId}/confirmation`, ADM);
    await ctx.call('POST', '/me/event/confirm', 'p1:c1');
    const body = await board(ctx.call);
    expect(body).toMatchObject({ state: 'confirming', registered: 2, confirmed: 1 });
    expect(JSON.stringify(body)).not.toContain(active?.code ?? 'nada');
  });

  it('em andamento: pareamentos e cronômetro', async () => {
    const ctx = await setupRound();
    await ctx.start();
    expect(await board(ctx.call)).toMatchObject({ state: 'running', tournament: 'FODASE', round: 3, startedAt: expect.any(String) as unknown });
  });

  it('resultado final e encerrado: classificação, até o próximo evento', async () => {
    const ctx = await setupRound();
    await ctx.start();
    await ctx.send(upload('standings'));
    const final = (await board(ctx.call)) as Extract<BoardResponse, { state: 'final' }>;
    expect(final.state).toBe('final');
    expect(final.standings[0]).toEqual({
      division: 'Divisão Mestre', rank: 1, name: 'teste5 5', wins: 3, losses: 0, ties: 0, points: 9, opponentWinPct: 50, opponentsOpponentWinPct: 58.33,
    });
    expect(final.standings).toHaveLength(5);
    await ctx.call('POST', `/events/${ctx.eventId}/close`, ADM);
    expect((await board(ctx.call)).state).toBe('final');
    await ctx.call('POST', '/events', ADM, { label: 'Próximo' });
    expect((await board(ctx.call)).state).toBe('open');
  });

  it('resultado final: o jogador vê a própria colocação, achada pelo Player ID das guias', async () => {
    const ctx = await setupRound();
    const active = ((await ctx.call('GET', '/events/active', ADM)).body as ActiveEventResponse).event;
    await ctx.call('POST', `/join/${active?.code ?? ''}`, 'p1:c1');
    await ctx.call('POST', `/events/${ctx.eventId}/confirmation`, ADM);
    await ctx.call('POST', '/me/event/confirm', 'p1:c1');
    await ctx.call('POST', '/round/start', ADM, { bestOf: 3, roundMinutes: null });
    expect(((await ctx.call('GET', '/me/event', 'p1:c1')).body as MyEventResponse).placement).toBeNull();
    await ctx.send(upload('standings'));
    // p1 é o Player ID 100001, "teste2 2" nas guias do TOM.
    expect(((await ctx.call('GET', '/me/event', 'p1:c1')).body as MyEventResponse).placement).toEqual({
      rank: 2, total: 5, wins: 2, losses: 1, ties: 0, points: 6,
    });
  });

  it('cancelado volta à espera', async () => {
    const ctx = setup();
    await register(ctx.call, 'adm:a1');
    const created = (await ctx.call('POST', '/events', ADM, { label: 'Liga' })).body as { id: string };
    await ctx.call('POST', `/events/${created.id}/cancel`, ADM);
    expect((await board(ctx.call)).state).toBe('idle');
  });
});
