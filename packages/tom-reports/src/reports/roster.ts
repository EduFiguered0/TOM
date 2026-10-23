import { divisionTables, expectCells, footerTournament, generatedAt, int, load } from '../shared/html.js';

/** O roster não traz Player ID; serve só para conferência. */
export interface RosterEntry {
  division: string;
  table: number;
  name: string;
  ageDivision: string;
  staticSeat: string | null;
  byes: number;
}

export interface RosterReport {
  tournament: string;
  generatedAt: string;
  players: RosterEntry[];
}

export const parseRoster = (html: string): RosterReport => {
  const root = load(html);
  const players = divisionTables(root, 'table.players_table').flatMap(({ division, rows }) =>
    rows.map((cells): RosterEntry => {
      const [table, name, ageDivision, staticSeat, byes] = expectCells(cells, 5, 'roster') as [
        string, string, string, string, string,
      ];
      return {
        division,
        table: int(table, 'Mesa'),
        name,
        ageDivision,
        staticSeat: staticSeat || null,
        byes: byes ? int(byes, 'Byes') : 0,
      };
    }),
  );
  return { tournament: footerTournament(root), generatedAt: generatedAt(root), players };
};
