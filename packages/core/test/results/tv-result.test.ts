import { describe, expect, it } from 'vitest';
import { tvResult } from '../../src/index.js';

describe('resultado da mesa para a TV', () => {
  it('nada antes do verde', () => {
    expect(tvResult({ color: 'gray' })).toBeNull();
    expect(tvResult({ color: 'orange', reportedBy: 'player1' })).toBeNull();
    expect(tvResult({ color: 'red', reason: 'timeout' })).toBeNull();
  });

  it('verde: vencedor, empate ou derrota dupla, sem placar', () => {
    expect(tvResult({ color: 'green', result: { kind: 'games', player1: 2, player2: 1, winner: 'player1' }, source: 'reports' })).toBe('player1');
    expect(tvResult({ color: 'green', result: { kind: 'games', player1: 0, player2: 2, winner: 'player2' }, source: 'override' })).toBe('player2');
    expect(tvResult({ color: 'green', result: { kind: 'games', player1: 1, player2: 1, winner: null }, source: 'reports' })).toBe('tie');
    expect(tvResult({ color: 'green', result: { kind: 'intentional_draw' }, source: 'override' })).toBe('tie');
    expect(tvResult({ color: 'green', result: { kind: 'double_game_loss' }, source: 'override' })).toBe('double_loss');
    expect(tvResult({ color: 'green', result: { kind: 'bye' }, source: 'bye' })).toBeNull();
  });
});
