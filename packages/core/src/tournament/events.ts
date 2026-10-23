import type { Override } from '../results/match-result.js';
import type { Report } from '../results/report.js';
import type { BestOf, Side } from '../results/score.js';
import type { Actor } from '../shared/actor.js';
import type { RoundPairing, RoundRef } from './round-pairing.js';

export type RoundEventData =
  | { type: 'round_paired'; pairing: RoundPairing }
  | { type: 'round_started'; roundMinutes: number; bestOf: BestOf }
  | { type: 'report_submitted'; table: number; side: Side; report: Report }
  | { type: 'override_applied'; table: number; override: Override; reason: string }
  | { type: 'time_extended'; table: number; minutes: number }
  | { type: 'key_launched'; table: number };

/** Fato gravado; o estado da rodada é sempre recalculado a partir destes eventos. */
export type RoundEvent = RoundEventData & {
  id: string;
  ref: RoundRef;
  at: Date;
  actor: Actor;
};
