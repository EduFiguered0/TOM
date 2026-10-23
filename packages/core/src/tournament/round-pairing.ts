import type { TomKey } from '../results/tom-key.js';
import type { PlayerId } from '../shared/player-id.js';

/** Uma rodada de uma divisão; a divisão faz parte da chave da mesa. */
export interface RoundRef {
  tournament: string;
  division: string;
  round: number;
}

export const streamKey = (ref: RoundRef): string => `${ref.tournament}#${ref.division}#${String(ref.round)}`;

export interface PairedTable {
  table: number;
  player1: { playerId: PlayerId; name: string };
  player2: { playerId: PlayerId; name: string };
  keys: Record<TomKey, string>;
}

/** Pareamento de uma rodada como o TOM publicou. O bye vem só com o nome (o TOM não traz o Player ID). */
export interface RoundPairing {
  ref: RoundRef;
  tables: PairedTable[];
  byes: string[];
}
