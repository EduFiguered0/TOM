import { describe, expect, it } from 'vitest';
import { fixture } from './helpers.js';
import { parseStandings } from '../src/index.js';

describe('parseStandings', () => {
  it('lê classificação com pontos e percentuais', () => {
    const report = parseStandings(fixture('fodase/FODASEstandings'));

    expect(report).toMatchObject({ tournament: 'FODASE', round: 3, totalRounds: 3, generatedAt: '10/12/2026 14:12:06' });
    expect(report.standings).toHaveLength(5);
    expect(report.standings[0]).toEqual({
      division: 'Divisão Mestre',
      rank: 1,
      name: 'teste5 5',
      section: '1',
      droppedRound: null,
      record: { wins: 3, losses: 0, ties: 0, points: 9 },
      points: 9,
      opponentWinPct: 50,
      opponentsOpponentWinPct: 58.33,
    });
    expect(report.standings.map((s) => s.name)).toEqual(['teste5 5', 'teste2 2', 'teste3 3', 'teste4 4', 'teste1 1']);
  });

  it('lê rodada abandonada (drop)', () => {
    const html = fixture('fodase/FODASEstandings').replace('<td align="center">&nbsp;</td>', '<td align="center">2</td>');
    expect(parseStandings(html).standings[0]?.droppedRound).toBe(2);
  });
});
