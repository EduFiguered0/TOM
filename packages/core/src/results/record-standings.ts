import type { FinalStanding } from '../tournament/tournament-event.js';

export interface RecordRow {
  division: string;
  name: string;
  wins: number;
  losses: number;
  ties: number;
}

const byName = new Intl.Collator('pt-BR', { sensitivity: 'base' });

/**
 * Registro de partida do TOM como classificação: só vitórias, derrotas e empates, sem desempates.
 * Ordena por pontos (vitória 3, empate 1); quem empata divide a posição, em ordem alfabética.
 */
export const standingsFromRecord = (rows: RecordRow[]): FinalStanding[] => {
  const points = (r: RecordRow) => r.wins * 3 + r.ties;
  const sorted = [...rows].sort((a, b) => byName.compare(a.division, b.division) || points(b) - points(a) || byName.compare(a.name, b.name));
  return sorted.map((r) => {
    const first = sorted.findIndex((o) => o.division === r.division);
    const tied = sorted.findIndex((o) => o.division === r.division && points(o) === points(r));
    return {
      division: r.division, rank: tied - first + 1, name: r.name, wins: r.wins, losses: r.losses, ties: r.ties,
      points: points(r), opponentWinPct: null, opponentsOpponentWinPct: null,
    };
  });
};
