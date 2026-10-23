import { tableDeadline } from '../results/deadline.js';
import type { Override } from '../results/match-result.js';
import type { Report } from '../results/report.js';
import type { BestOf, Side } from '../results/score.js';
import { tableStatus, type TableStatus } from '../results/thermometer.js';
import type { Actor } from '../shared/actor.js';
import type { RoundEvent } from './events.js';
import type { PairedTable, RoundPairing, RoundRef } from './round-pairing.js';

export interface AppliedOverride {
  override: Override;
  reason: string;
  by: Actor;
  at: Date;
}

export interface TableState extends PairedTable {
  reports: Partial<Record<Side, Report>>;
  override: AppliedOverride | null;
  extraMinutes: number;
  keyLaunched: boolean;
  deadline: Date | null;
  status: TableStatus;
}

export interface RoundState {
  ref: RoundRef;
  pairing: RoundPairing | null;
  startedAt: Date | null;
  roundMinutes: number | null;
  bestOf: BestOf | null;
  tables: TableState[];
  byes: string[];
  /** Todas as mesas verdes: o ADM pode lançar as keys. */
  allGreen: boolean;
  /** Todas as keys lançadas: a próxima rodada pode começar. */
  closed: boolean;
}

type Draft = Omit<TableState, 'deadline' | 'status'>;

const freshTable = (t: PairedTable): Draft => ({ ...t, reports: {}, override: null, extraMinutes: 0, keyLaunched: false });

/** Função pura: o mesmo histórico e o mesmo instante dão sempre o mesmo estado. */
export const projectRound = (ref: RoundRef, events: readonly RoundEvent[], now: Date): RoundState => {
  let pairing: RoundPairing | null = null;
  let startedAt: Date | null = null;
  let roundMinutes: number | null = null;
  let bestOf: BestOf | null = null;
  let tables = new Map<number, Draft>();

  const at = (table: number): Draft | undefined => tables.get(table);

  for (const e of events) {
    switch (e.type) {
      case 'round_paired':
        pairing = e.pairing;
        tables = new Map(e.pairing.tables.map((t) => [t.table, freshTable(t)]));
        break;
      case 'round_started':
        startedAt = e.at;
        roundMinutes = e.roundMinutes;
        bestOf = e.bestOf;
        break;
      case 'report_submitted': {
        const t = at(e.table);
        if (t) t.reports = { ...t.reports, [e.side]: e.report };
        break;
      }
      case 'override_applied': {
        const t = at(e.table);
        if (t) t.override = { override: e.override, reason: e.reason, by: e.actor, at: e.at };
        break;
      }
      case 'time_extended': {
        const t = at(e.table);
        if (t) t.extraMinutes += e.minutes;
        break;
      }
      case 'key_launched': {
        const t = at(e.table);
        if (t) t.keyLaunched = true;
        break;
      }
    }
  }

  const projected = [...tables.values()].map((t): TableState => {
    const deadline = startedAt && roundMinutes ? tableDeadline(startedAt, roundMinutes, t.extraMinutes) : null;
    const status = tableStatus(
      { bestOf: bestOf ?? 3, isBye: false, reports: t.reports, override: t.override?.override, deadline },
      now,
    );
    return { ...t, deadline, status };
  });

  return {
    ref,
    pairing,
    startedAt,
    roundMinutes,
    bestOf,
    tables: projected,
    byes: pairing?.byes ?? [],
    allGreen: pairing !== null && projected.every((t) => t.status.color === 'green'),
    closed: pairing !== null && projected.every((t) => t.keyLaunched),
  };
};
