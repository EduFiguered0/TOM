import type { ActiveEventResponse, BoardResponse, MyEventResponse } from '@tom/contracts';
import { describe, expect, it } from 'vitest';
import { register, setup, setupRound, upload } from './support.js';

const ADM = 'adm:a1:admin';

/** A TV é do ADM: garante a conta do ADM (cadastrar de novo só dá 409) e lê o quadro com a sessão dele. */
const board = async (call: ReturnType<typeof setup>['call']) => {
  await register(call, 'adm:a1');
  const response = await call('GET', '/board', ADM);
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
    // O pareamento do TOM já chegou: o nome do evento passa a ser o do torneio.
    expect(await board(ctx.call)).toMatchObject({ state: 'open', event: { label: 'FODASE' }, code: active?.code, registered: 1 });
  });

  it('em andamento: pareamentos, cronômetro e o código do QR para quem chega tarde', async () => {
    const ctx = await setupRound();
    const active = ((await ctx.call('GET', '/events/active', ADM)).body as ActiveEventResponse).event;
    await ctx.start();
    expect(await board(ctx.call)).toMatchObject({
      state: 'running', tournament: 'FODASE', round: 3, startedAt: expect.any(String) as unknown, code: active?.code,
    });
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
    expect((await board(ctx.call)).state).toBe('idle');
  });

  it('o ADM reexibe e tira da TV a classificação do último evento; evento novo tira sozinho', async () => {
    const ctx = await setupRound();
    await ctx.start();
    await ctx.send(upload('standings'));
    await ctx.call('POST', `/events/${ctx.eventId}/close`, ADM);
    expect((await ctx.call('GET', '/events/active', ADM)).body).toMatchObject({ event: null, last: { id: ctx.eventId, canShow: true, onTv: false } });
    expect((await ctx.call('POST', `/events/${ctx.eventId}/tv`, 'p1:c1', { on: true })).status).toBe(403);
    expect(await ctx.call('POST', `/events/${ctx.eventId}/tv`, ADM, { on: true })).toMatchObject({ status: 200, body: { last: { onTv: true } } });
    expect((await board(ctx.call)).state).toBe('final');
    await ctx.call('POST', `/events/${ctx.eventId}/tv`, ADM, { on: false });
    expect((await board(ctx.call)).state).toBe('idle');
    await ctx.call('POST', `/events/${ctx.eventId}/tv`, ADM, { on: true });
    await ctx.call('POST', '/events', ADM, { label: 'Próximo' });
    expect((await board(ctx.call)).state).toBe('open');
    expect((await ctx.call('GET', '/events/active', ADM)).body).toMatchObject({ last: null });
  });

  it('standings intermediário: classificação parcial até o pareamento seguinte; o de rodada anterior não cobre as mesas', async () => {
    const ctx = await setupRound();
    await ctx.start();
    const partial = (round: string, at: string) => upload('standings', upload('standings').content.replace('Rodada 3/3', `Rodada ${round}/4`), at);
    await ctx.send(partial('2', '2026-10-24T15:00:00Z'));
    const running = (await board(ctx.call)) as Extract<BoardResponse, { state: 'running' }>;
    expect(running.state).toBe('running');
    await ctx.send(partial('3', '2026-10-24T15:10:00Z'));
    const shown = (await board(ctx.call)) as Extract<BoardResponse, { state: 'standings' }>;
    // O nome do evento passa a ser o do torneio no TOM.
    // Mesma tela da rodada: a classificação no lugar das mesas, com a divisão e o QR para quem chega tarde.
    expect(shown).toMatchObject({ state: 'standings', round: 3, division: 'Divisão Mestre', code: running.code, event: { label: 'FODASE' } });
    expect(running.code).not.toBe('');
    expect(shown.standings).toHaveLength(5);
    expect(((await ctx.call('GET', '/events/active', ADM)).body as ActiveEventResponse).event?.status).toBe('running');
  });

  it('registro de partida também leva a TV aos resultados; a classificação da mesma rodada prevalece', async () => {
    const ctx = await setupRound();
    await ctx.start();
    const record = (at: string) => upload('matchrecord', upload('matchrecord').content.replace('Rodada 2/3', 'Rodada 3/4'), at);
    await ctx.send(record('2026-10-24T15:00:00Z'));
    const fromRecord = (await board(ctx.call)) as Extract<BoardResponse, { state: 'standings' }>;
    expect(fromRecord).toMatchObject({ state: 'standings', round: 3 });
    expect(fromRecord.standings[0]).toMatchObject({ rank: 1, opponentWinPct: null });
    expect(fromRecord.standings.map((s) => s.points)).toEqual([...fromRecord.standings.map((s) => s.points)].sort((a, b) => (b ?? 0) - (a ?? 0)));

    await ctx.send(upload('standings', upload('standings').content.replace('Rodada 3/3', 'Rodada 3/4'), '2026-10-24T15:05:00Z'));
    await ctx.send(record('2026-10-24T15:10:00Z'));
    const official = (await board(ctx.call)) as Extract<BoardResponse, { state: 'standings' }>;
    expect(official.standings[0]?.opponentWinPct).not.toBeNull();
  });

  it('mesa verde leva o vencedor; antes, nada', async () => {
    const ctx = await setupRound();
    await ctx.start();
    const table1 = async () => ((await board(ctx.call)) as Extract<BoardResponse, { state: 'running' }>).tables[0];
    await ctx.report('p1:c1', { kind: 'score', own: 2, opponent: 1 });
    expect(await table1()).toMatchObject({ table: 1, color: 'orange', result: null });
    await ctx.report('p2:c2', { kind: 'score', own: 1, opponent: 2 });
    expect(await table1()).toMatchObject({ table: 1, color: 'green', result: 'player1' });
  });

  it('resultado final: o jogador vê a própria colocação, achada pelo Player ID das guias', async () => {
    const ctx = await setupRound();
    const active = ((await ctx.call('GET', '/events/active', ADM)).body as ActiveEventResponse).event;
    await ctx.call('POST', `/join/${active?.code ?? ''}`, 'p1:c1');
    await ctx.start();
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
