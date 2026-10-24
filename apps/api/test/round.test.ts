import type { MyRoundResponse } from '@tom/contracts';
import { describe, expect, it } from 'vitest';
import { register, upload, withEvent } from './support.js';

/** Mesa 1 do FODASE, rodada 3: 100001 "teste2 2" x 100002 "teste5 5". */
const setupRound = async () => {
  const ctx = await withEvent();
  await ctx.send(upload('pairings'));
  await ctx.send(upload('match_slips'));
  const p1 = await register(ctx.call, 'p1:c1', '100001');
  const p2 = await register(ctx.call, 'p2:c2', '100002');
  for (const [id, pid] of [[p1, '100001'], [p2, '100002']] as const) {
    await ctx.call('POST', `/accounts/${id}/player-id`, 'adm:a1:admin', { playerId: pid });
  }
  const me = async (token: string) => (await ctx.call('GET', '/round/me', token)).body as MyRoundResponse;
  const report = (token: string, report: unknown) => ctx.call('POST', '/round/report', token, { report });
  const start = () => ctx.call('POST', '/round/start', 'adm:a1:admin', { bestOf: 3, roundMinutes: null });
  return { ...ctx, me, report, start };
};

const seat = (r: MyRoundResponse) => r.round?.seat;

describe('rodada no celular do jogador', () => {
  it('sem rodada publicada: round null', async () => {
    const ctx = await withEvent();
    await register(ctx.call, 'p1:c1', '100001');
    expect(((await ctx.call('GET', '/round/me', 'p1:c1')).body as MyRoundResponse).round).toBeNull();
  });

  it('mostra a mesa e o oponente; check-in pendente não mostra mesa', async () => {
    const { me, call } = await setupRound();
    expect(await me('p1:c1')).toMatchObject({
      round: { tournament: 'FODASE', round: 3, startedAt: null, seat: { kind: 'table', table: 1, opponent: 'teste5 5', color: 'gray', myReport: null } },
    });
    await register(call, 'p9:c9', '100009');
    expect(seat(await me('p9:c9'))).toEqual({ kind: 'not_checked_in' });
  });

  it('só reporta depois que o ADM inicia; só o ADM inicia', async () => {
    const { report, call, start } = await setupRound();
    expect((await report('p1:c1', { kind: 'score', own: 2, opponent: 1 })).body).toMatchObject({ error: 'round_not_started' });
    expect((await call('POST', '/round/start', 'p1:c1', { bestOf: 3, roundMinutes: null })).status).toBe(403);
    expect((await start()).status).toBe(200);
    expect((await start()).body).toMatchObject({ error: 'round_already_started' });
  });

  it('reportes coerentes deixam a mesa verde e travada; o placar do oponente nunca aparece', async () => {
    const { report, me, start } = await setupRound();
    await start();
    const first = (await report('p1:c1', { kind: 'score', own: 2, opponent: 1 })).body as MyRoundResponse;
    expect(seat(first)).toMatchObject({ color: 'orange', myReport: { kind: 'score', own: 2, opponent: 1 }, opponentReported: false, locked: false });
    expect(seat(await me('p2:c2'))).toMatchObject({ color: 'orange', myReport: null, opponentReported: true });
    expect(JSON.stringify(await me('p2:c2'))).not.toContain('"own":2');

    expect(seat((await report('p2:c2', { kind: 'score', own: 1, opponent: 2 })).body as MyRoundResponse)).toMatchObject({ color: 'green', locked: true });
    expect((await report('p1:c1', { kind: 'score', own: 2, opponent: 0 })).body).toMatchObject({ error: 'table_locked' });
  });

  it('reportes divergentes ficam vermelhos com o motivo; corrigir volta a verde', async () => {
    const { report, start } = await setupRound();
    await start();
    await report('p1:c1', { kind: 'score', own: 2, opponent: 1 });
    expect(seat((await report('p2:c2', { kind: 'score', own: 2, opponent: 0 })).body as MyRoundResponse)).toMatchObject({ color: 'red', redReason: 'outcome_conflict' });
    expect(seat((await report('p2:c2', { kind: 'score', own: 1, opponent: 2 })).body as MyRoundResponse)).toMatchObject({ color: 'green' });
  });

  it('placar inválido e quem não está em mesa são recusados', async () => {
    const { report, start, call } = await setupRound();
    await start();
    expect((await report('p1:c1', { kind: 'score', own: 3, opponent: 0 })).status).toBe(400);
    expect((await report('p1:c1', { kind: 'empate' })).status).toBe(400);
    const outsider = await register(call, 'p7:c7', '100099');
    await call('POST', `/accounts/${outsider}/player-id`, 'adm:a1:admin', { playerId: '100099' });
    expect((await report('p7:c7', { kind: 'intentional_draw' })).body).toMatchObject({ error: 'not_your_table' });
  });
});
