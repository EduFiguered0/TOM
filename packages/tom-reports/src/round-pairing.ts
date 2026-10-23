import type { PairedTable, RoundPairing } from '@tom/core';
import type { MatchSlip, MatchSlipsReport } from './reports/match-slips.js';
import type { PairingsReport } from './reports/pairings.js';
import { InconsistentReportsError } from './shared/errors.js';

const samePlayers = (slip: MatchSlip, a: string, b: string): boolean =>
  (slip.player1.name === a && slip.player2.name === b) || (slip.player1.name === b && slip.player2.name === a);

const toTable = (slip: MatchSlip): PairedTable => ({
  table: slip.table,
  player1: { playerId: slip.player1.playerId, name: slip.player1.name },
  player2: { playerId: slip.player2.playerId, name: slip.player2.name },
  keys: slip.keys,
});

/**
 * Cruza pairings (divisão, mesas e bye) com match_slips (Player ID e keys).
 * As guias são obrigatórias para toda mesa: sem elas não há vínculo Player ID ↔ mesa.
 */
export const toRoundPairings = (slips: MatchSlipsReport, pairings: PairingsReport): RoundPairing[] => {
  const pending = new Map(slips.slips.map((s) => [s.table, s]));
  for (const s of slips.slips) {
    if (s.round !== pairings.round || s.tournament !== pairings.tournament) {
      throw new InconsistentReportsError(
        `Guia da mesa ${String(s.table)} é de "${s.tournament}" rodada ${String(s.round)}; pareamento é de "${pairings.tournament}" rodada ${String(pairings.round)}`,
      );
    }
  }

  const byDivision = new Map<string, RoundPairing>();
  for (const p of pairings.pairings) {
    const entry = byDivision.get(p.division) ?? {
      ref: { tournament: pairings.tournament, division: p.division, round: pairings.round },
      tables: [],
      byes: [],
    };
    byDivision.set(p.division, entry);
    if (p.table === null || p.opponent === null) {
      entry.byes.push(p.player.name);
      continue;
    }
    const slip = pending.get(p.table);
    if (!slip || !samePlayers(slip, p.player.name, p.opponent.name)) {
      throw new InconsistentReportsError(`Mesa ${String(p.table)} sem guia correspondente; gere as guias da rodada no TOM`);
    }
    pending.delete(p.table);
    entry.tables.push(toTable(slip));
  }

  if (pending.size > 0) {
    throw new InconsistentReportsError(`Guias sem pareamento: mesas ${[...pending.keys()].join(', ')}`);
  }
  return [...byDivision.values()];
};
