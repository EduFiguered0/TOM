import { describe, expect, it } from 'vitest';
import {
  InvalidDurationError,
  canPlayerReport,
  gamesResult,
  overrideRequiresTomFix,
  tableDeadline,
  tomKeyFor,
  type TableStatus,
} from '../../src/index.js';

const start = new Date('2026-10-23T14:00:00Z');

describe('tableDeadline', () => {
  it('30 minutos por padrão', () => {
    expect(tableDeadline(start)).toEqual(new Date('2026-10-23T14:30:00Z'));
  });

  it('tempo ajustado pelo ADM mais acréscimo da mesa', () => {
    expect(tableDeadline(start, 50, 5)).toEqual(new Date('2026-10-23T14:55:00Z'));
  });

  it.each([[0, 0], [30, -1], [30.5, 0]])('rejeita rodada %s min / acréscimo %s min', (round, extra) => {
    expect(() => tableDeadline(start, round, extra)).toThrow(InvalidDurationError);
  });
});

describe('travas', () => {
  const green: TableStatus = { color: 'green', result: gamesResult(2, 0), source: 'reports' };
  const red: TableStatus = { color: 'red', reason: 'timeout' };

  it('jogador reporta enquanto a mesa não está verde', () => {
    expect(canPlayerReport({ color: 'gray' }, false)).toBe(true);
    expect(canPlayerReport(red, false)).toBe(true);
  });

  it('verde ou key lançada trava o jogador', () => {
    expect(canPlayerReport(green, false)).toBe(false);
    expect(canPlayerReport(red, true)).toBe(false);
  });

  it('override após key lançada avisa que o TOM precisa ser corrigido', () => {
    expect(overrideRequiresTomFix(true)).toBe(true);
    expect(overrideRequiresTomFix(false)).toBe(false);
  });
});

describe('tomKeyFor', () => {
  it.each([
    [gamesResult(2, 1), 'player1Wins'],
    [gamesResult(0, 2), 'player2Wins'],
    [gamesResult(1, 1), 'tie'],
    [{ kind: 'intentional_draw' } as const, 'tie'],
    [{ kind: 'double_game_loss' } as const, null],
    [{ kind: 'bye' } as const, null],
  ])('%j → %s', (result, key) => {
    expect(tomKeyFor(result)).toBe(key);
  });
});
