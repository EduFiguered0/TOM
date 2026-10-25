import type { PairedTable, RoundPairing } from '@tom/core';
import type { MatchSlip, MatchSlipsReport } from './reports/match-slips.js';
import type { PairingsReport } from './reports/pairings.js';
import { InconsistentReportsError } from './shared/errors.js';

/** As guias do TOM cortam o nome em 20 letras; o pareamento traz o nome completo. */
const SLIP_NAME_MAX = 20;
const sameName = (slipName: string, full: string): boolean =>
  slipName === full || (slipName.length === SLIP_NAME_MAX && full.startsWith(slipName));

/** Mesa com os nomes completos do pareamento, na ordem da guia; null se os jogadores não batem. */
const toTable = (slip: MatchSlip, a: string, b: string): PairedTable | null => {
  const [name1, name2] = sameName(slip.player1.name, a) && sameName(slip.player2.name, b) ? [a, b]
    : sameName(slip.player1.name, b) && sameName(slip.player2.name, a) ? [b, a] : [null, null];
  if (!name1 || !name2) return null;
  return {
    table: slip.table,
    player1: { playerId: slip.player1.playerId, name: name1 },
    player2: { playerId: slip.player2.playerId, name: name2 },
    keys: slip.keys,
  };
};

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
    const table = slip ? toTable(slip, p.player.name, p.opponent.name) : null;
    if (!table) {
      throw new InconsistentReportsError(`Mesa ${String(p.table)} sem guia correspondente; gere as guias da rodada no TOM`);
    }
    pending.delete(p.table);
    entry.tables.push(table);
  }

  if (pending.size > 0) {
    throw new InconsistentReportsError(`Guias sem pareamento: mesas ${[...pending.keys()].join(', ')}`);
  }
  return [...byDivision.values()];
};
