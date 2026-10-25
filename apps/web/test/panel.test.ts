import type { PanelTable } from '@tom/contracts';
import { describe, expect, it } from 'vitest';
import { describeOverride, describePlayerReport, nextAction, overrideScores, pickTable, sortForAction } from '../src/panel/panel.js';

const table = (n: number, over: Partial<PanelTable> = {}): PanelTable => ({
  table: n,
  player1: { name: 'Ana', playerId: '1' },
  player2: { name: 'Bia', playerId: '2' },
  color: 'gray', redReason: null, reports: { player1: null, player2: null }, override: null,
  extraMinutes: 0, deadline: null, tomKey: null, keyLaunched: false, ...over,
});

describe('painel', () => {
  it('ordem de ação: vermelho, laranja, cinza, verde; key lançada por último', () => {
    const tables = [
      table(1, { color: 'green', keyLaunched: true }), table(2, { color: 'gray' }), table(3, { color: 'red' }),
      table(4, { color: 'green' }), table(5, { color: 'orange' }), table(6, { color: 'red' }),
    ];
    expect(sortForAction(tables).map((t) => t.table)).toEqual([3, 6, 5, 2, 4, 1]);
  });

  it('descreve reportes e overrides', () => {
    expect(describePlayerReport(null)).toBe('não reportou');
    expect(describePlayerReport({ kind: 'score', own: 2, opponent: 1 })).toBe('2x1');
    expect(describePlayerReport({ kind: 'intentional_draw' })).toBe('ID');
    expect(describeOverride({ kind: 'win_by_absence', winner: 'player1' }, table(1))).toBe('Vitória por ausência de Bia');
    expect(describeOverride({ kind: 'score', player1: 0, player2: 2 }, table(1))).toBe('Bia venceu 2x0');
    expect(describeOverride({ kind: 'score', player1: 1, player2: 1 }, table(1))).toBe('Empate 1x1');
  });

  it('próxima ação por estado da mesa', () => {
    expect(nextAction(table(1), false)).toBe('Rodada não iniciada');
    expect(nextAction(table(1, { color: 'red', redReason: 'timeout' }), true)).toMatch(/Tempo esgotado/);
    expect(nextAction(table(1, { color: 'red', redReason: 'score_mismatch' }), true)).toMatch(/não batem/);
    expect(nextAction(table(1, { color: 'green', tomKey: { label: 'Empate', code: '1' } }), true)).toBe('Lançar a key no TOM');
    expect(nextAction(table(1, { color: 'green' }), true)).toMatch(/DGL/);
    expect(nextAction(table(1, { color: 'green', keyLaunched: true }), true)).toBe('Key lançada');
  });

  it('mesa aberta: mantém a escolhida; senão a primeira que pede ação', () => {
    const tables = [table(1, { color: 'gray' }), table(2, { color: 'red' })];
    expect(pickTable(tables, 1)).toBe(1);
    expect(pickTable(tables, 9)).toBe(2);
    expect(pickTable(tables, null)).toBe(2);
    expect(pickTable([], 1)).toBeNull();
  });

  it('placares do ajuste, do ponto de vista do jogador 1: vitórias, derrotas, empates', () => {
    expect(overrideScores(3)).toEqual([[2, 0], [2, 1], [1, 0], [0, 2], [1, 2], [0, 1], [1, 1], [0, 0]]);
    expect(overrideScores(1)).toEqual([[1, 0], [0, 1], [0, 0]]);
  });
});
