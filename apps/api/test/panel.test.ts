import type { PanelResponse } from '@tom/contracts';
import { describe, expect, it } from 'vitest';
import { addJudge, setupRound, upload } from './support.js';

const ADM = 'adm:a1:admin';
const JUIZ = 'juiz:j1';

const withPanel = async () => {
  const ctx = await setupRound();
  const judgeId = await addJudge(ctx, JUIZ, '100050');
  const panel = async (token = ADM) => (await ctx.call('GET', '/panel', token)).body as PanelResponse;
  const table1 = async () => (await panel()).round?.tables.find((t) => t.table === 1);
  const act = (action: string, body?: unknown, token = ADM) => ctx.call('POST', `/panel/tables/1/${action}`, token, body);
  return { ...ctx, judgeId, panel, table1, act };
};

describe('painel do ADM e do juiz', () => {
  it('só juiz escalado e ADM; jogador recebe 403', async () => {
    const { call, panel } = await withPanel();
    expect(await call('GET', '/panel', 'p1:c1')).toMatchObject({
      status: 403, body: { message: 'Só o ADM e os juízes escalados no evento usam o painel' },
    });
    expect((await panel(JUIZ)).round?.tournament).toBe('FODASE');
  });

  it('juiz escalado num evento antigo não usa o painel do evento ativo', async () => {
    const { call, eventId } = await withPanel();
    await call('POST', `/events/${eventId}/cancel`, ADM);
    expect((await call('POST', '/events', ADM, { label: 'Outro evento' })).status).toBe(201);
    expect((await call('GET', '/panel', JUIZ)).status).toBe(403);
  });

  it('juiz escalado já usa o painel antes de o TOM publicar a primeira rodada', async () => {
    const { call, judgeId } = await withPanel();
    expect((await call('GET', '/panel', JUIZ)).status).toBe(200);
    expect((await call('GET', '/me', JUIZ)).body).toMatchObject({ judging: true });
    expect(judgeId).toBeTruthy();
  });

  it('juiz escalado que está nas guias da rodada não usa o painel (nem na própria mesa)', async () => {
    const { call, eventId, start } = await withPanel();
    // p1 (100001) joga a mesa 1 e é escalado como juiz por engano.
    const p1 = ((await call('GET', '/me', 'p1:c1')).body as { id: string }).id;
    await call('POST', `/staff/accounts/${p1}/judge`, ADM, { judge: true });
    await call('PUT', `/events/${eventId}/judges`, ADM, { judges: [p1] });
    await start();
    const override = { override: { kind: 'win_by_absence', winner: 'player1' }, reason: 'teste' };
    expect(await call('POST', '/panel/tables/1/override', 'p1:c1', override)).toMatchObject({
      status: 403, body: { message: 'Você é juiz deste evento' },
    });
    expect((await call('GET', '/panel', 'p1:c1')).status).toBe(403);
  });

  it('juiz tirado da equipe perde o painel na hora', async () => {
    const { call, judgeId } = await withPanel();
    await call('POST', `/staff/accounts/${judgeId}/judge`, ADM, { judge: false });
    expect((await call('GET', '/panel', JUIZ)).status).toBe(403);
  });

  it('mostra todas as mesas com Player IDs, os dois reportes e os totais por cor', async () => {
    const { panel, start, report } = await withPanel();
    await start();
    await report('p1:c1', { kind: 'score', own: 2, opponent: 1 });
    const round = (await panel()).round;
    expect(round?.counts.orange).toBe(1);
    expect(round?.tables.find((t) => t.table === 1)).toMatchObject({
      player1: { playerId: '100001', name: 'teste2 2' },
      reports: { player1: { kind: 'score', own: 2, opponent: 1 }, player2: null },
      color: 'orange',
      tomKey: null,
    });
  });

  it('mesa verde mostra a key do TOM; ADM marca key lançada; juiz não', async () => {
    const { start, report, table1, act } = await withPanel();
    await start();
    await report('p1:c1', { kind: 'score', own: 2, opponent: 1 });
    await report('p2:c2', { kind: 'score', own: 1, opponent: 2 });
    expect((await table1())?.tomKey).toEqual({ label: 'Vitória de teste2 2', code: '23119' });
    expect((await act('key-launched', undefined, JUIZ)).status).toBe(403);
    expect((await act('key-launched')).status).toBe(200);
    expect((await table1())?.keyLaunched).toBe(true);
    expect((await act('key-launched')).body).toMatchObject({ error: 'key_already_launched' });
  });

  it('override do juiz exige motivo, prevalece sobre os reportes e avisa se a key já foi lançada', async () => {
    const { start, report, table1, act } = await withPanel();
    await start();
    await report('p1:c1', { kind: 'score', own: 2, opponent: 0 });
    await report('p2:c2', { kind: 'score', own: 2, opponent: 0 });
    expect((await table1())?.color).toBe('red');
    expect((await act('override', { override: { kind: 'win_by_absence', winner: 'player2' }, reason: ' ' }, JUIZ)).status).toBe(400);
    const ok = await act('override', { override: { kind: 'win_by_absence', winner: 'player2' }, reason: 'Jogador 1 ausente' }, JUIZ);
    expect(ok.body).toMatchObject({ requiresTomFix: false });
    expect(await table1()).toMatchObject({ color: 'green', override: { reason: 'Jogador 1 ausente', by: expect.stringMatching(/^judge:/) as unknown } });
    await act('key-launched');
    const late = await act('override', { override: { kind: 'double_game_loss' }, reason: 'Correção' });
    expect(late.body).toMatchObject({ requiresTomFix: true });
    expect((await table1())?.tomKey).toBeNull();
  });

  it('rodadas anteriores: o ADM vê e ajusta a rodada 3 para liberar a 4', async () => {
    const { start, send, call, panel } = await withPanel();
    await start();
    const next = (report: string) => upload(report, upload(report).content.replace(/Rodada\s+3/g, 'Rodada 4'), '2026-10-24T15:00:00Z');
    await send(next('pairings'));
    await send(next('match_slips'));
    expect((await panel()).round?.round).toBe(4);
    expect((await panel()).latestRound).toBe(4);
    expect((await call('POST', '/round/start', ADM, { bestOf: 3, roundMinutes: null })).body).toMatchObject({ error: 'previous_round_open' });

    const previous = async () => ((await call('GET', '/panel/rounds/3', ADM)).body as PanelResponse).round;
    expect((await previous())?.round).toBe(3);
    for (const table of [1, 2]) {
      const path = `/panel/rounds/3/tables/${String(table)}`;
      expect((await call('POST', `${path}/override`, ADM, { override: { kind: 'intentional_draw' }, reason: 'Não reportaram' })).status).toBe(200);
      expect((await call('POST', `${path}/key-launched`, ADM)).status).toBe(200);
    }
    expect((await previous())?.closed).toBe(true);
    expect((await call('POST', '/round/start', ADM, { bestOf: 3, roundMinutes: null })).status).toBe(200);
  });

  it('rodada fora do torneio atual não existe no painel', async () => {
    const { call } = await withPanel();
    expect((await call('GET', '/panel/rounds/9', ADM)).body).toMatchObject({ error: 'round_not_paired' });
    expect((await call('GET', '/panel/rounds/0', ADM)).body).toMatchObject({ error: 'round_not_paired' });
  });

  it('acréscimo de tempo e reporte em nome do jogador sem celular (só ADM)', async () => {
    const { start, table1, act } = await withPanel();
    await start();
    expect((await act('extend', { minutes: 5 }, JUIZ)).status).toBe(200);
    expect((await table1())?.extraMinutes).toBe(5);
    expect((await act('extend', { minutes: 0 })).status).toBe(400);
    expect((await act('report', { side: 'player2', report: { kind: 'score', own: 0, opponent: 2 } }, JUIZ)).status).toBe(403);
    expect((await act('report', { side: 'player2', report: { kind: 'score', own: 0, opponent: 2 } })).status).toBe(200);
    expect((await table1())?.reports.player2).toEqual({ kind: 'score', own: 0, opponent: 2 });
  });
});
