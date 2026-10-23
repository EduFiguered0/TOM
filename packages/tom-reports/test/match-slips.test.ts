import { describe, expect, it } from 'vitest';
import { fixture } from './helpers.js';
import { TomParseError, parseMatchSlips } from '../src/index.js';

describe('parseMatchSlips', () => {
  it('extrai mesa, Player ID e keys de cada guia', () => {
    const report = parseMatchSlips(fixture('fodase/FODASEmatch_slips'));

    expect(report.generatedAt).toBe('10/12/2026 14:11:52');
    expect(report.slips).toHaveLength(2);
    expect(report.slips[0]).toEqual({
      tournament: 'FODASE',
      round: 3,
      table: 1,
      player1: {
        playerId: '100001',
        name: 'teste2 2',
        division: 'ME',
        record: { wins: 2, losses: 0, ties: 0, points: 6 },
      },
      player2: {
        playerId: '100002',
        name: 'teste5 5',
        division: 'ME',
        record: { wins: 2, losses: 0, ties: 0, points: 6 },
      },
      keys: { player1Wins: '23119', player2Wins: '23127', tie: '23135' },
    });
    expect(report.slips[1]).toMatchObject({
      table: 2,
      player1: { playerId: '100005', name: 'teste3 3' },
      player2: { playerId: '100004', name: 'teste4 4' },
      keys: { player1Wins: '23218', player2Wins: '23226', tie: '23234' },
    });
  });

  it('rodada só com bye gera lista vazia', () => {
    expect(parseMatchSlips(fixture('evento-teste/Evento testematch_slips')).slips).toEqual([]);
  });

  it('falha alto quando a guia está incompleta', () => {
    const html = fixture('fodase/FODASEmatch_slips').replace('data-barcode="23119"', 'data-barcode=""');
    expect(() => parseMatchSlips(html)).toThrow(TomParseError);
  });
});
