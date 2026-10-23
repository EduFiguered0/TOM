import { divisionTables, expectCells, footerTournament, generatedAt, int, load, roundOf, text } from '../shared/html.js';

export interface PlayerMatchRecord {
  division: string;
  name: string;
  section: string;
  wins: number;
  losses: number;
  ties: number;
}

export interface MatchRecordReport {
  tournament: string;
  round: number;
  totalRounds: number | null;
  generatedAt: string;
  players: PlayerMatchRecord[];
}

export const parseMatchRecord = (html: string): MatchRecordReport => {
  const root = load(html);
  const players = divisionTables(root, 'table.report').flatMap(({ division, rows }) =>
    rows.map((cells): PlayerMatchRecord => {
      const [name, section, wins, losses, ties] = expectCells(cells, 5, 'matchrecord') as [
        string, string, string, string, string,
      ];
      return {
        division,
        name,
        section,
        wins: int(wins, 'Vitórias'),
        losses: int(losses, 'Derrotas'),
        ties: int(ties, 'Empates'),
      };
    }),
  );
  return {
    tournament: footerTournament(root),
    ...roundOf(text(root.querySelector('h3'))),
    generatedAt: generatedAt(root),
    players,
  };
};
