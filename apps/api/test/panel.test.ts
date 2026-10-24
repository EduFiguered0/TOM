import type { PanelResponse } from '@tom/contracts';
import { describe, expect, it } from 'vitest';
import { register, setupRound } from './support.js';

const ADM = 'adm:a1:admin';

const withPanel = async () => {
  const ctx = await setupRound();
  await register(ctx.call, 'juiz:j1');
  const panel = async (token = ADM) => (await ctx.call('GET', '/panel', token)).body as PanelResponse;
  const table1 = async () => (await panel()).round?.tables.find((t) => t.table === 1);
  const act = (action: string, body?: unknown, token = ADM) => ctx.call('POST', `/panel/tables/1/${action}`, token, body);
  return { ...ctx, panel, table1, act };
};

describe('painel do ADM e do juiz', () => {
  it('só juiz e ADM; jogador recebe 403', async () => {
    const { call, panel } = await withPanel();
    expect((await call('GET', '/panel', 'p1:c1')).status).toBe(403);
    expect((await panel('juiz:j1:judge')).round?.tournament).toBe('FODASE');
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
    expect((await act('key-launched', undefined, 'juiz:j1:judge')).status).toBe(403);
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
    expect((await act('override', { override: { kind: 'win_by_absence', winner: 'player2' }, reason: ' ' }, 'juiz:j1:judge')).status).toBe(400);
    const ok = await act('override', { override: { kind: 'win_by_absence', winner: 'player2' }, reason: 'Jogador 1 ausente' }, 'juiz:j1:judge');
    expect(ok.body).toMatchObject({ requiresTomFix: false });
    expect(await table1()).toMatchObject({ color: 'green', override: { reason: 'Jogador 1 ausente', by: expect.stringMatching(/^judge:/) as unknown } });
    await act('key-launched');
    const late = await act('override', { override: { kind: 'double_game_loss' }, reason: 'Correção' });
    expect(late.body).toMatchObject({ requiresTomFix: true });
    expect((await table1())?.tomKey).toBeNull();
  });

  it('acréscimo de tempo e reporte em nome do jogador sem celular (só ADM)', async () => {
    const { start, table1, act } = await withPanel();
    await start();
    expect((await act('extend', { minutes: 5 }, 'juiz:j1:judge')).status).toBe(200);
    expect((await table1())?.extraMinutes).toBe(5);
    expect((await act('extend', { minutes: 0 })).status).toBe(400);
    expect((await act('report', { side: 'player2', report: { kind: 'score', own: 0, opponent: 2 } }, 'juiz:j1:judge')).status).toBe(403);
    expect((await act('report', { side: 'player2', report: { kind: 'score', own: 0, opponent: 2 } })).status).toBe(200);
    expect((await table1())?.reports.player2).toEqual({ kind: 'score', own: 0, opponent: 2 });
  });
});
