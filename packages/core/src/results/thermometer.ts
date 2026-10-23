import { gamesResult, overrideResult, type MatchResult, type Override } from './match-result.js';
import type { Report } from './report.js';
import { outcomeOf, type BestOf, type Outcome, type Side } from './score.js';

export type RedReason = 'outcome_conflict' | 'score_mismatch' | 'timeout';

export type TableStatus =
  | { color: 'gray' }
  | { color: 'orange'; reportedBy: Side }
  | { color: 'green'; result: MatchResult; source: 'reports' | 'override' | 'bye' }
  | { color: 'red'; reason: RedReason };

export interface TableInput {
  bestOf: BestOf;
  isBye: boolean;
  reports: Partial<Record<Side, Report>>;
  override?: Override | undefined;
  /** Prazo da mesa (rodada + acréscimo); null enquanto a rodada não foi iniciada. */
  deadline: Date | null;
}

type Reconciled = { ok: true; result: MatchResult } | { ok: false; reason: 'outcome_conflict' | 'score_mismatch' };

type Declared = Outcome | 'intentional_draw';

const outcome = (r: Report): Declared => (r.kind === 'intentional_draw' ? 'intentional_draw' : outcomeOf(r.own, r.opponent));

const mirrored: Record<Declared, Declared> = {
  win: 'loss', loss: 'win', draw: 'draw', intentional_draw: 'intentional_draw',
};

/** Os dois lados batem quando os desfechos se completam e o placar é espelhado (2x1 ↔ 1x2). */
const reconcile = (p1: Report, p2: Report): Reconciled => {
  if (mirrored[outcome(p1)] !== outcome(p2)) return { ok: false, reason: 'outcome_conflict' };
  if (p1.kind === 'intentional_draw' || p2.kind === 'intentional_draw') {
    return { ok: true, result: { kind: 'intentional_draw' } };
  }
  if (p1.own !== p2.opponent || p1.opponent !== p2.own) return { ok: false, reason: 'score_mismatch' };
  return { ok: true, result: gamesResult(p1.own, p1.opponent) };
};

export const tableStatus = (input: TableInput, now: Date): TableStatus => {
  if (input.override) {
    return { color: 'green', result: overrideResult(input.override, input.bestOf), source: 'override' };
  }
  if (input.isBye) return { color: 'green', result: { kind: 'bye' }, source: 'bye' };

  const { player1, player2 } = input.reports;
  if (player1 && player2) {
    const reconciled = reconcile(player1, player2);
    return reconciled.ok
      ? { color: 'green', result: reconciled.result, source: 'reports' }
      : { color: 'red', reason: reconciled.reason };
  }
  if (input.deadline && now >= input.deadline) return { color: 'red', reason: 'timeout' };
  if (player1) return { color: 'orange', reportedBy: 'player1' };
  if (player2) return { color: 'orange', reportedBy: 'player2' };
  return { color: 'gray' };
};

/** A próxima rodada só começa com todas as mesas verdes. */
export const allGreen = (statuses: readonly TableStatus[]): boolean => statuses.every((s) => s.color === 'green');
