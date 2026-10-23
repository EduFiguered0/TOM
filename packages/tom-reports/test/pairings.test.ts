import { describe, expect, it } from 'vitest';
import { fixture } from './helpers.js';
import { TomParseError, parsePairings } from '../src/index.js';

describe('parsePairings', () => {
  it('lê rodada, bye e partidas sem duplicar', () => {
    const report = parsePairings(fixture('fodase/FODASEpairings'));

    expect(report).toMatchObject({ tournament: 'FODASE', round: 3, generatedAt: '10/12/2026 14:11:52' });
    expect(report.pairings).toEqual([
      {
        division: 'Divisão Mestre',
        table: null,
        player: { name: 'teste1 1', record: { wins: 1, losses: 2, ties: 0, points: 3 } },
        opponent: null,
      },
      {
        division: 'Divisão Mestre',
        table: 1,
        player: { name: 'teste2 2', record: { wins: 2, losses: 0, ties: 0, points: 6 } },
        opponent: { name: 'teste5 5', record: { wins: 2, losses: 0, ties: 0, points: 6 } },
      },
      {
        division: 'Divisão Mestre',
        table: 2,
        player: { name: 'teste3 3', record: { wins: 1, losses: 1, ties: 0, points: 3 } },
        opponent: { name: 'teste4 4', record: { wins: 1, losses: 1, ties: 0, points: 3 } },
      },
    ]);
  });

  it('rodada só com bye', () => {
    const report = parsePairings(fixture('evento-teste/Evento testepairings'));
    expect(report.tournament).toBe('Evento teste');
    expect(report.pairings).toEqual([
      {
        division: 'Divisão Mestre',
        table: null,
        player: { name: 'teste4 4', record: { wins: 1, losses: 2, ties: 0, points: 3 } },
        opponent: null,
      },
    ]);
  });

  it('falha alto quando a coluna muda', () => {
    const html = fixture('fodase/FODASEpairings').replace('<td align="center" class="center">contra', '<td>x</td><td>');
    expect(() => parsePairings(html)).toThrow(TomParseError);
  });
});
