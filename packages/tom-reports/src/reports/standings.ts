import { TomParseError } from '../shared/errors.js';
import { divisionTables, expectCells, footerTournament, generatedAt, int, load, roundOf, text } from '../shared/html.js';
import { parseRecord, type MatchRecord } from '../shared/record.js';

export interface Standing {
  division: string;
  rank: number;
  name: string;
  section: string;
  droppedRound: number | null;
  record: MatchRecord;
  points: number;
  opponentWinPct: number;
  opponentsOpponentWinPct: number;
}

export interface StandingsReport {
  tournament: string;
  round: number;
  totalRounds: number | null;
  generatedAt: string;
  standings: Standing[];
}

const pct = (value: string): number => {
  const match = /^(\d+(?:\.\d+)?)%$/.exec(value);
  if (!match?.[1]) throw new TomParseError(`Percentual inválido: "${value}"`);
  return Number(match[1]);
};

export const parseStandings = (html: string): StandingsReport => {
  const root = load(html);
  const standings = divisionTables(root, 'table.report').flatMap(({ division, rows }) =>
    rows.map((cells): Standing => {
      const [rank, name, section, dropped, record, points, owp, oowp] = expectCells(cells, 8, 'standings') as [
        string, string, string, string, string, string, string, string,
      ];
      return {
        division,
        rank: int(rank, 'Classificação'),
        name,
        section,
        droppedRound: dropped ? int(dropped, 'Rodada abandonada') : null,
        record: parseRecord(record),
        points: int(points, 'Pontos'),
        opponentWinPct: pct(owp),
        opponentsOpponentWinPct: pct(oowp),
      };
    }),
  );
  return {
    tournament: footerTournament(root),
    ...roundOf(text(root.querySelector('h3'))),
    generatedAt: generatedAt(root),
    standings,
  };
};
