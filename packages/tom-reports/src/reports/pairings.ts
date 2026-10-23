import { TomParseError } from '../shared/errors.js';
import { divisionTables, expectCells, footerTournament, generatedAt, int, load, roundOf, text } from '../shared/html.js';
import { parseRecord, type MatchRecord } from '../shared/record.js';

export interface PairingEntry {
  name: string;
  record: MatchRecord;
}

/** `table` e `opponent` são null no bye. */
export interface Pairing {
  division: string;
  table: number | null;
  player: PairingEntry;
  opponent: PairingEntry | null;
}

export interface PairingsReport {
  tournament: string;
  round: number;
  generatedAt: string;
  pairings: Pairing[];
}

const entry = (cell: string): PairingEntry => {
  const match = /^(.+?) \((\d+\/\d+\/\d+ \(\d+\))\)$/.exec(cell);
  if (!match?.[1] || !match[2]) throw new TomParseError(`Jogador inválido: "${cell}"`);
  return { name: match[1], record: parseRecord(match[2]) };
};

/** O TOM lista cada partida duas vezes (uma de cada lado); fica só a primeira. */
export const parsePairings = (html: string): PairingsReport => {
  const root = load(html);
  const seen = new Set<string>();
  const pairings: Pairing[] = [];
  for (const { division, rows } of divisionTables(root, 'table.report')) {
    for (const cells of rows) {
      const [table, player, , opponent] = expectCells(cells, 4, 'pairings') as [string, string, string, string];
      const isBye = opponent === '';
      const id = `${division}#${table}`;
      if (!isBye && seen.has(id)) continue;
      seen.add(id);
      pairings.push({
        division,
        table: isBye ? null : int(table, 'Mesa'),
        player: entry(player),
        opponent: isBye ? null : entry(opponent),
      });
    }
  }
  return {
    tournament: footerTournament(root),
    round: roundOf(text(root.querySelector('h3'))).round,
    generatedAt: generatedAt(root),
    pairings,
  };
};
