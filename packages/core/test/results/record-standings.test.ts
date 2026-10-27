import { describe, expect, it } from 'vitest';
import { standingsFromRecord } from '../../src/results/record-standings.js';

const player = (name: string, wins: number, losses: number, ties = 0) => ({ division: 'Mestre', name, wins, losses, ties });

describe('classificação pelo registro de partida', () => {
  it('ordena por pontos (vitória 3, empate 1); empatados dividem a posição, em ordem alfabética; sem desempates', () => {
    const rows = standingsFromRecord([player('Bruno', 1, 1), player('ana', 1, 1), player('Caio', 2, 0), player('Duda', 0, 1, 1), player('Eva', 0, 2)]);
    expect(rows.map((r) => [r.rank, r.name, r.points])).toEqual([
      [1, 'Caio', 6], [2, 'ana', 3], [2, 'Bruno', 3], [4, 'Duda', 1], [5, 'Eva', 0],
    ]);
    expect(rows[0]).toMatchObject({ division: 'Mestre', wins: 2, losses: 0, ties: 0, opponentWinPct: null, opponentsOpponentWinPct: null });
  });

  it('cada divisão tem a própria contagem', () => {
    const rows = standingsFromRecord([{ ...player('Ana', 1, 0), division: 'Júnior' }, player('Caio', 0, 1)]);
    expect(rows.map((r) => [r.division, r.rank])).toEqual([['Júnior', 1], ['Mestre', 1]]);
  });
});
