import { describe, expect, it } from 'vitest';
import { allGreen, intentionalDrawReport, tableStatus, type Report, type TableInput } from '../../src/index.js';

const s = (own: number, opponent: number): Report => ({ kind: 'score', own, opponent });
const deadline = new Date('2026-10-23T14:30:00Z');
const before = new Date('2026-10-23T14:10:00Z');
const after = new Date('2026-10-23T14:30:00Z');

const table = (overrides: Partial<TableInput> = {}): TableInput => ({
  bestOf: 3, isBye: false, reports: {}, deadline, ...overrides,
});

describe('tableStatus', () => {
  it('cinza: ninguém reportou, dentro do tempo', () => {
    expect(tableStatus(table(), before)).toEqual({ color: 'gray' });
  });

  it('laranja: só um lado reportou', () => {
    expect(tableStatus(table({ reports: { player2: s(2, 1) } }), before)).toEqual({ color: 'orange', reportedBy: 'player2' });
  });

  it('verde: vitória + derrota com placar espelhado', () => {
    expect(tableStatus(table({ reports: { player1: s(2, 1), player2: s(1, 2) } }), before)).toEqual({
      color: 'green', source: 'reports', result: { kind: 'games', player1: 2, player2: 1, winner: 'player1' },
    });
  });

  it('verde: empate em games (1x1) dos dois lados', () => {
    expect(tableStatus(table({ reports: { player1: s(1, 1), player2: s(1, 1) } }), before)).toMatchObject({
      color: 'green', result: { kind: 'games', winner: null },
    });
  });

  it('verde: intentional draw dos dois lados', () => {
    const reports = { player1: intentionalDrawReport(), player2: intentionalDrawReport() };
    expect(tableStatus(table({ reports }), before)).toMatchObject({ color: 'green', result: { kind: 'intentional_draw' } });
  });

  it('verde: bye já nasce verde', () => {
    expect(tableStatus(table({ isBye: true }), after)).toEqual({ color: 'green', source: 'bye', result: { kind: 'bye' } });
  });

  it.each([
    ['vitória + vitória', s(2, 0), s(2, 1)],
    ['derrota + derrota', s(0, 2), s(1, 2)],
    ['empate + vitória', s(1, 1), s(2, 1)],
    ['intentional draw + empate em games', intentionalDrawReport(), s(0, 0)],
  ])('vermelho por conflito: %s', (_, player1, player2) => {
    expect(tableStatus(table({ reports: { player1, player2 } }), before)).toEqual({ color: 'red', reason: 'outcome_conflict' });
  });

  it('vermelho: desfechos batem mas o placar diverge', () => {
    expect(tableStatus(table({ reports: { player1: s(2, 0), player2: s(1, 2) } }), before)).toEqual({
      color: 'red', reason: 'score_mismatch',
    });
  });

  it('vermelho por tempo: cinza e laranja no fim do prazo', () => {
    expect(tableStatus(table(), after)).toEqual({ color: 'red', reason: 'timeout' });
    expect(tableStatus(table({ reports: { player1: s(2, 0) } }), after)).toEqual({ color: 'red', reason: 'timeout' });
  });

  it('vermelho por tempo volta a verde sozinho com reportes coerentes', () => {
    expect(tableStatus(table({ reports: { player1: s(2, 0), player2: s(0, 2) } }), after).color).toBe('green');
  });

  it('rodada não iniciada nunca estoura o tempo', () => {
    expect(tableStatus(table({ deadline: null }), after)).toEqual({ color: 'gray' });
  });

  it('override prevalece sobre reportes em conflito', () => {
    const input = table({
      reports: { player1: s(2, 0), player2: s(2, 0) },
      override: { kind: 'double_game_loss' },
    });
    expect(tableStatus(input, after)).toEqual({ color: 'green', source: 'override', result: { kind: 'double_game_loss' } });
  });
});

describe('allGreen', () => {
  it('libera a próxima rodada só com todas verdes', () => {
    const green = tableStatus(table({ isBye: true }), before);
    expect(allGreen([green, green])).toBe(true);
    expect(allGreen([green, { color: 'orange', reportedBy: 'player1' }])).toBe(false);
    expect(allGreen([])).toBe(true);
  });
});
