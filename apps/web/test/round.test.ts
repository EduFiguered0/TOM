import type { SeatDto } from '@tom/contracts';
import { describe, expect, it } from 'vitest';
import { describeReport, reportOptions, seatMessage } from '../src/round/round.js';

type TableSeat = Extract<SeatDto, { kind: 'table' }>;
const seat = (over: Partial<TableSeat>): TableSeat => ({
  kind: 'table', table: 1, opponent: 'teste5 5', deadline: null, extraTurns: null, color: 'gray', redReason: null, myReport: null, opponentReported: false, locked: false, opponentPhoto: null, ...over,
});

describe('opções de reporte', () => {
  it('só Ganhei ou Perdi: o TOM não recebe placar', () => {
    expect(reportOptions()).toEqual([
      { label: 'Ganhei', report: { kind: 'score', own: 1, opponent: 0 }, tone: 'win' },
      { label: 'Perdi', report: { kind: 'score', own: 0, opponent: 1 }, tone: 'loss' },
    ]);
  });

  it('descreve o reporte sem placar', () => {
    expect(describeReport({ kind: 'score', own: 1, opponent: 0 })).toBe('Ganhei');
    expect(describeReport({ kind: 'score', own: 1, opponent: 2 })).toBe('Perdi');
    expect(describeReport({ kind: 'score', own: 1, opponent: 1 })).toBe('Empate');
    expect(describeReport({ kind: 'intentional_draw' })).toBe('Intentional draw (ID)');
  });
});

describe('mensagem da mesa', () => {
  it('uma frase por cor, dizendo o que fazer', () => {
    expect(seatMessage(seat({}), false).text).toMatch(/Aguardando o ADM iniciar/);
    expect(seatMessage(seat({}), true).text).toMatch(/Reporte o resultado/);
    expect(seatMessage(seat({ color: 'orange', myReport: { kind: 'intentional_draw' } }), true).text).toBe('Resultado enviado. Aguardando o oponente.');
    expect(seatMessage(seat({ color: 'orange', opponentReported: true }), true).text).toMatch(/Falta o seu/);
    expect(seatMessage(seat({ color: 'green', locked: true }), true)).toEqual({ tone: 'ok', text: 'Resultado validado. Bom jogo!' });
    expect(seatMessage(seat({ color: 'red', redReason: 'outcome_conflict' }), true)).toEqual({ tone: 'error', text: 'Os reportes não batem. Chamem o juiz.' });
    expect(seatMessage(seat({ color: 'red', redReason: 'timeout' }), true).text).toMatch(/Tempo esgotado/);
  });
});
