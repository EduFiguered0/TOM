import type { Override } from '../results/match-result.js';
import type { Report } from '../results/report.js';
import type { BestOf, Side } from '../results/score.js';
import type { Actor } from '../shared/actor.js';
import type { RoundPairing, RoundRef } from './round-pairing.js';

/** Minutos somam ao prazo; turnos trocam o relógio pela contagem de turnos (a mesa não estoura por tempo). */
export type RoundExtra = { minutes: number } | { turns: number };

export type RoundEventData =
  | { type: 'round_paired'; pairing: RoundPairing }
  | { type: 'round_started'; roundMinutes: number; bestOf: BestOf }
  | { type: 'report_submitted'; table: number; side: Side; report: Report }
  | { type: 'override_applied'; table: number; override: Override; reason: string }
  /** Acréscimo antigo, mesa por mesa: só lido do histórico. */
  | { type: 'time_extended'; table: number; minutes: number }
  /** Acréscimo da rodada: minutos ou turnos extras para as mesas sem resultado no momento do clique. */
  | { type: 'round_extended'; tables: number[]; extra: RoundExtra }
  | { type: 'key_launched'; table: number };

/** Fato gravado; o estado da rodada é sempre recalculado a partir destes eventos. */
export type RoundEvent = RoundEventData & {
  id: string;
  ref: RoundRef;
  at: Date;
  actor: Actor;
};
