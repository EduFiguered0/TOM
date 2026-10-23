import { describe, expect, it } from 'vitest';
import { fixture } from './helpers.js';
import { identifyReportFile, parseMatchRecord, parseRoster, parseTournamentDetails } from '../src/index.js';

describe('parseMatchRecord', () => {
  it('lê V/D/E por jogador', () => {
    const report = parseMatchRecord(fixture('fodase/FODASEmatchrecord'));
    expect(report).toMatchObject({ tournament: 'FODASE', round: 2, totalRounds: 3 });
    expect(report.players).toHaveLength(5);
    expect(report.players[0]).toEqual({
      division: 'Divisão Mestre', name: 'teste1 1', section: '1', wins: 0, losses: 2, ties: 0,
    });
  });
});

describe('parseRoster', () => {
  it('lê jogadores e divisão sem o sufixo de contagem', () => {
    const report = parseRoster(fixture('fodase/FODASEroster'));
    expect(report.tournament).toBe('FODASE');
    expect(report.players).toHaveLength(5);
    expect(report.players[4]).toEqual({
      division: 'Divisão Mestre', table: 3, name: 'teste5 5', ageDivision: 'ME', staticSeat: null, byes: 0,
    });
  });
});

describe('parseTournamentDetails', () => {
  it('lê metadados e divisões', () => {
    expect(parseTournamentDetails(fixture('fodase/FODASEtournament_details'))).toEqual({
      tournament: 'FODASE',
      tournamentId: '',
      location: 'RJ, Brazil',
      startedAt: '10/12/2026 14:09:22',
      organizer: 'Teste ADM (0000000)',
      mode: 'Custom Mode',
      gameType: 'Pokémon Estampas Ilustradas',
      structure: 'Suíça',
      generatedAt: '10/12/2026 14:09:30',
      divisions: [
        { division: 'Divisão Mestre', players: 5, rounds: 3, finalists: 0, totalRounds: 3, totalTime: '2:00:00', firstTable: 1 },
      ],
    });
  });
});

describe('identifyReportFile', () => {
  it.each([
    ['FODASEpairings.html', { tournament: 'FODASE', type: 'pairings' }],
    ['Evento testematch_slips.html', { tournament: 'Evento teste', type: 'match_slips' }],
    ['Xtournament_details.html', { tournament: 'X', type: 'tournament_details' }],
    ['pairings.html', null],
    ['FODASEpairings.htm', null],
    ['main.css', null],
  ])('%s', (name, expected) => {
    expect(identifyReportFile(name)).toEqual(expected);
  });
});
