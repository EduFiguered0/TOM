import { describe, expect, it } from 'vitest';
import { InconsistentReportsError, parseMatchSlips, parsePairings, toRoundPairings } from '../src/index.js';
import { fixture } from './helpers.js';

const slips = () => parseMatchSlips(fixture('fodase/FODASEmatch_slips'));
const pairings = () => parsePairings(fixture('fodase/FODASEpairings'));

describe('toRoundPairings', () => {
  it('junta mesas com Player ID e keys, e o bye pelo nome', () => {
    expect(toRoundPairings(slips(), pairings())).toEqual([
      {
        ref: { tournament: 'FODASE', division: 'Divisão Mestre', round: 3 },
        tables: [
          {
            table: 1,
            player1: { playerId: '100001', name: 'teste2 2' },
            player2: { playerId: '100002', name: 'teste5 5' },
            keys: { player1Wins: '23119', player2Wins: '23127', tie: '23135' },
          },
          {
            table: 2,
            player1: { playerId: '100005', name: 'teste3 3' },
            player2: { playerId: '100004', name: 'teste4 4' },
            keys: { player1Wins: '23218', player2Wins: '23226', tie: '23234' },
          },
        ],
        byes: ['teste1 1'],
      },
    ]);
  });

  it('rodada só com bye não precisa de guias', () => {
    const result = toRoundPairings(
      parseMatchSlips(fixture('evento-teste/Evento testematch_slips')),
      parsePairings(fixture('evento-teste/Evento testepairings')),
    );
    expect(result).toEqual([
      { ref: { tournament: 'Evento teste', division: 'Divisão Mestre', round: 3 }, tables: [], byes: ['teste4 4'] },
    ]);
  });

  it('recusa guias de outra rodada (arquivos defasados)', () => {
    const old = { ...slips(), slips: slips().slips.map((s) => ({ ...s, round: 2 })) };
    expect(() => toRoundPairings(old, pairings())).toThrow(InconsistentReportsError);
  });

  it('recusa mesa sem guia e guia sem mesa', () => {
    const missing = { ...slips(), slips: slips().slips.slice(0, 1) };
    expect(() => toRoundPairings(missing, pairings())).toThrow(/Mesa 2 sem guia/);
    const extra = { ...pairings(), pairings: pairings().pairings.slice(0, 2) };
    expect(() => toRoundPairings(slips(), extra)).toThrow(/Guias sem pareamento: mesas 2/);
  });

  it('recusa guia com jogadores diferentes do pareamento', () => {
    const swapped = { ...slips(), slips: slips().slips.map((s) => (s.table === 1 ? { ...s, table: 2 } : { ...s, table: 1 })) };
    expect(() => toRoundPairings(swapped, pairings())).toThrow(InconsistentReportsError);
  });
});
