import type { SeatDto } from '@tom/contracts';
import { describe, expect, it } from 'vitest';
import { describeReport, reportOptions, seatMessage } from '../src/round/round.js';

type TableSeat = Extract<SeatDto, { kind: 'table' }>;
const seat = (over: Partial<TableSeat>): TableSeat => ({
  kind: 'table', table: 1, opponent: 'teste5 5', deadline: null, extraTurns: null, color: 'gray', redReason: null, myReport: null, opponentReported: false, locked: false, opponentPhoto: null, ...over,
});

describe('opções de reporte', () => {
  it('melhor de 3: vitórias, derrotas, empates e ID, sem placar impossível', () => {
    expect(reportOptions(3).map((o) => o.label)).toEqual([
      'Ganhei 2x0', 'Ganhei 2x1', 'Ganhei 1x0',
      'Perdi 0x2', 'Perdi 1x2', 'Perdi 0x1',
      'Empate 1x1', 'Empate 0x0', 'Intentional draw (ID)',
    ]);
  });

  it('melhor de 1', () => {
    expect(reportOptions(1).map((o) => o.label)).toEqual(['Ganhei 1x0', 'Perdi 0x1', 'Empate 0x0', 'Intentional draw (ID)']);
  });

  it('descreve o reporte', () => {
    expect(describeReport({ kind: 'score', own: 2, opponent: 1 })).toBe('2x1');
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
