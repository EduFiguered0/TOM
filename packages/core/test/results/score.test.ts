import { describe, expect, it } from 'vitest';
import { InvalidScoreError, overrideResult, scoreReport } from '../../src/index.js';

describe('scoreReport', () => {
  it.each([
    [2, 0], [2, 1], [1, 0], [0, 2], [1, 2], [0, 1], [1, 1], [0, 0],
  ])('melhor de 3 aceita %ix%i', (own, opponent) => {
    expect(scoreReport(own, opponent, 3)).toEqual({ kind: 'score', own, opponent });
  });

  it.each([
    [2, 2], [3, 0], [-1, 0], [1.5, 0], [2, 1.5],
  ])('melhor de 3 rejeita %sx%s', (own, opponent) => {
    expect(() => scoreReport(own, opponent, 3)).toThrow(InvalidScoreError);
  });

  it.each([[1, 0], [0, 1], [0, 0]])('melhor de 1 aceita %ix%i', (own, opponent) => {
    expect(scoreReport(own, opponent, 1).kind).toBe('score');
  });

  it.each([[2, 0], [1, 1]])('melhor de 1 rejeita %ix%i', (own, opponent) => {
    expect(() => scoreReport(own, opponent, 1)).toThrow(InvalidScoreError);
  });
});

describe('overrideResult', () => {
  it('vitória por ausência vale 2x0 no melhor de 3 e 1x0 no melhor de 1', () => {
    expect(overrideResult({ kind: 'win_by_absence', winner: 'player2' }, 3)).toEqual({
      kind: 'games', player1: 0, player2: 2, winner: 'player2',
    });
    expect(overrideResult({ kind: 'win_by_absence', winner: 'player1' }, 1)).toEqual({
      kind: 'games', player1: 1, player2: 0, winner: 'player1',
    });
  });

  it('placar do juiz também é validado', () => {
    expect(() => overrideResult({ kind: 'score', player1: 2, player2: 2 }, 3)).toThrow(InvalidScoreError);
    expect(overrideResult({ kind: 'score', player1: 1, player2: 1 }, 3)).toEqual({
      kind: 'games', player1: 1, player2: 1, winner: null,
    });
  });

  it('double game loss e intentional draw', () => {
    expect(overrideResult({ kind: 'double_game_loss' }, 3)).toEqual({ kind: 'double_game_loss' });
    expect(overrideResult({ kind: 'intentional_draw' }, 3)).toEqual({ kind: 'intentional_draw' });
  });
});
