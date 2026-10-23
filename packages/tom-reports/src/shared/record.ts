import { TomParseError } from './errors.js';

/** Campanha V/D/E e pontos, como o TOM escreve: "2/1/0 (6)". */
export interface MatchRecord {
  wins: number;
  losses: number;
  ties: number;
  points: number;
}

export const parseRecord = (value: string): MatchRecord => {
  const match = /^(\d+)\/(\d+)\/(\d+) \((\d+)\)$/.exec(value.trim());
  if (!match) throw new TomParseError(`Campanha inválida: "${value}"`);
  const [, wins, losses, ties, points] = match.map(Number) as [number, number, number, number, number];
  return { wins, losses, ties, points };
};
