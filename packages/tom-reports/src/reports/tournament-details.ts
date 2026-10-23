import { TomParseError } from '../shared/errors.js';
import { expectCells, footerTournament, generatedAt, int, load, text } from '../shared/html.js';

export interface DivisionDetails {
  division: string;
  players: number;
  rounds: number;
  finalists: number;
  totalRounds: number;
  totalTime: string;
  firstTable: number;
}

export interface TournamentDetails {
  tournament: string;
  tournamentId: string;
  location: string;
  startedAt: string;
  organizer: string;
  mode: string;
  gameType: string;
  structure: string;
  generatedAt: string;
  divisions: DivisionDetails[];
}

/** Os rótulos são traduzidos; os campos são lidos pela ordem fixa das linhas. */
export const parseTournamentDetails = (html: string): TournamentDetails => {
  const root = load(html);
  const info = root.querySelectorAll('table:not(.report):not(.footer) tr').map((tr) => text(tr.querySelectorAll('td')[1]));
  if (info.length !== 8) throw new TomParseError(`tournament_details: esperado 8 campos, veio ${String(info.length)}`);
  const [tournament, tournamentId, location, startedAt, organizer, mode, gameType, structure] = info as [
    string, string, string, string, string, string, string, string,
  ];
  const divisions = root
    .querySelectorAll('table.report tr')
    .map((tr) => tr.querySelectorAll('td'))
    .filter((cells) => cells.length > 0)
    .map((cells): DivisionDetails => {
      const [division, players, , , rounds, finalists, totalRounds, , totalTime, firstTable] = expectCells(
        cells,
        10,
        'tournament_details',
      ) as [string, string, string, string, string, string, string, string, string, string];
      return {
        division,
        players: int(players, 'Jogadores'),
        rounds: int(rounds, 'Rodadas'),
        finalists: int(finalists, 'Jogadores nas finais'),
        totalRounds: int(totalRounds, 'Total de rodadas'),
        totalTime,
        firstTable: int(firstTable, 'Mesa inicial'),
      };
    });
  if (tournament !== footerTournament(root)) throw new TomParseError('tournament_details: nome divergente do rodapé');
  return { tournament, tournamentId, location, startedAt, organizer, mode, gameType, structure, generatedAt: generatedAt(root), divisions };
};
