import { DEFAULT_ROUND_MINUTES, InvalidDurationError, tableDeadline } from '../results/deadline.js';
import { canPlayerReport, overrideRequiresTomFix } from '../results/locks.js';
import { overrideResult, type Override } from '../results/match-result.js';
import { scoreReport, type Report } from '../results/report.js';
import { InvalidScoreError, type BestOf, type Side } from '../results/score.js';
import type { Actor, Role } from '../shared/actor.js';
import { CommandRejected } from '../shared/command-rejected.js';
import type { Clock, IdGenerator } from '../shared/ports.js';
import { ConcurrencyError, type EventStore } from './event-store.js';
import type { RoundEventData, RoundExtra } from './events.js';
import type { RoundPairing, RoundRef } from './round-pairing.js';
import { projectRound, type RoundState, type TableState } from './round-state.js';

export interface RoundServiceDeps {
  store: EventStore;
  clock: Clock;
  ids: IdGenerator;
}

const MAX_ATTEMPTS = 3;

const requireRole = (actor: Actor, ...roles: Role[]): void => {
  if (!roles.includes(actor.role)) throw new CommandRejected('forbidden', `Papel ${actor.role} não pode executar esta ação`);
};

const requireStarted = (state: RoundState): void => {
  if (!state.startedAt) throw new CommandRejected('round_not_started', 'A rodada ainda não foi iniciada');
};

const findTable = (state: RoundState, table: number): TableState => {
  const found = state.tables.find((t) => t.table === table);
  if (!found) throw new CommandRejected('table_not_found', `Mesa ${String(table)} não existe nesta rodada`);
  return found;
};

/** Erros de validação do domínio viram recusa do comando. */
const validated = <T>(fn: () => T): T => {
  try {
    return fn();
  } catch (e) {
    if (e instanceof InvalidScoreError || e instanceof InvalidDurationError) throw new CommandRejected('invalid_input', e.message);
    throw e;
  }
};

export class RoundService {
  constructor(private readonly deps: RoundServiceDeps) {}

  async state(ref: RoundRef): Promise<RoundState> {
    const { events } = await this.deps.store.read(ref);
    return projectRound(ref, events, this.deps.clock.now());
  }

  /** O enviador publica o pareamento lido do TOM; pode ser republicado até a rodada começar. */
  publishPairing(actor: Actor, pairing: RoundPairing): Promise<RoundState> {
    return this.execute(pairing.ref, (state) => {
      requireRole(actor, 'system', 'admin');
      if (state.startedAt) throw new CommandRejected('round_already_started', 'A rodada já começou; o pareamento não muda mais');
      return { actor, data: { type: 'round_paired', pairing } };
    });
  }

  /** Keys pendentes de rodadas anteriores não seguram a próxima: o painel avisa quais faltam. */
  async startRound(actor: Actor, ref: RoundRef, options: { bestOf: BestOf; roundMinutes?: number }): Promise<RoundState> {
    requireRole(actor, 'admin');
    const roundMinutes = options.roundMinutes ?? DEFAULT_ROUND_MINUTES;
    validated(() => tableDeadline(new Date(0), roundMinutes));
    return this.execute(ref, (state) => {
      if (!state.pairing) throw new CommandRejected('round_not_paired', 'O pareamento ainda não chegou do TOM');
      if (state.startedAt) throw new CommandRejected('round_already_started', 'A rodada já foi iniciada');
      return { actor, data: { type: 'round_started', roundMinutes, bestOf: options.bestOf } };
    });
  }

  /** Jogador reporta a própria mesa; o ADM reporta em nome de quem está sem celular (informando o lado). */
  submitReport(actor: Actor, ref: RoundRef, input: { table: number; report: Report; side?: Side }): Promise<RoundState> {
    return this.execute(ref, (state) => {
      requireRole(actor, 'player', 'admin');
      requireStarted(state);
      const table = findTable(state, input.table);
      const side = this.sideOf(actor, table, input.side);
      // Um reporte por jogador: correção é com o juiz (o ADM, reportando por quem está sem celular, ainda corrige).
      if (actor.role === 'player' && table.reports[side]) {
        throw new CommandRejected('table_locked', 'Você já reportou esta mesa. Para corrigir, chame o juiz.');
      }
      if (!canPlayerReport(table.status, table.keyLaunched)) {
        throw new CommandRejected('table_locked', 'Mesa já validada; só juiz ou ADM corrigem via override');
      }
      const raw = input.report;
      const report = raw.kind === 'score' ? validated(() => scoreReport(raw.own, raw.opponent, state.bestOf ?? 3)) : raw;
      return { actor, data: { type: 'report_submitted', table: table.table, side, report } };
    });
  }

  async applyOverride(
    actor: Actor,
    ref: RoundRef,
    input: { table: number; override: Override; reason?: string },
  ): Promise<{ state: RoundState; requiresTomFix: boolean }> {
    let requiresTomFix = false;
    const state = await this.execute(ref, (current) => {
      requireRole(actor, 'judge', 'admin');
      requireStarted(current);
      const table = findTable(current, input.table);
      // Motivo é opcional: custava tempo no evento; a auditoria guarda autor e horário.
      const reason = (input.reason ?? '').trim();
      validated(() => overrideResult(input.override, current.bestOf ?? 3));
      requiresTomFix = overrideRequiresTomFix(table.keyLaunched);
      return { actor, data: { type: 'override_applied', table: table.table, override: input.override, reason } };
    });
    return { state, requiresTomFix };
  }

  /**
   * Acréscimo da rodada (juiz ou ADM), depois que o tempo acaba: minutos ou turnos extras para todas as mesas
   * ainda sem resultado. Cada clique vale para as que continuam sem resultado.
   */
  extendRound(actor: Actor, ref: RoundRef, extra: RoundExtra): Promise<RoundState> {
    return this.execute(ref, (state) => {
      requireRole(actor, 'judge', 'admin');
      requireStarted(state);
      const [amount, max, label] = 'minutes' in extra ? [extra.minutes, 60, 'minutos'] : [extra.turns, 10, 'turnos'];
      if (!Number.isInteger(amount) || amount <= 0 || amount > max) {
        throw new CommandRejected('invalid_input', `Acréscimo deve ser de 1 a ${String(max)} ${label}`);
      }
      const end = tableDeadline(state.startedAt ?? new Date(0), state.roundMinutes ?? DEFAULT_ROUND_MINUTES);
      if (this.deps.clock.now() < end) throw new CommandRejected('round_running', 'O acréscimo só vale depois que o tempo da rodada acaba');
      const tables = state.tables.filter((t) => t.status.color !== 'green').map((t) => t.table);
      if (tables.length === 0) throw new CommandRejected('nothing_to_extend', 'Todas as mesas já têm resultado');
      return { actor, data: { type: 'round_extended', tables, extra } };
    });
  }

  markKeyLaunched(actor: Actor, ref: RoundRef, input: { table: number }): Promise<RoundState> {
    return this.execute(ref, (state) => {
      requireRole(actor, 'admin');
      const table = findTable(state, input.table);
      if (table.keyLaunched) throw new CommandRejected('key_already_launched', 'Key já marcada como lançada');
      if (table.status.color !== 'green') throw new CommandRejected('not_green', 'Só mesa verde tem key para lançar');
      return { actor, data: { type: 'key_launched', table: table.table } };
    });
  }

  private sideOf(actor: Actor, table: TableState, side: Side | undefined): Side {
    if (actor.role === 'player') {
      if (table.player1.playerId === actor.playerId) return 'player1';
      if (table.player2.playerId === actor.playerId) return 'player2';
      throw new CommandRejected('not_your_table', 'Você não joga nesta mesa');
    }
    if (!side) throw new CommandRejected('side_required', 'Informe por qual jogador está reportando');
    return side;
  }

  /** Lê, valida sobre o estado atual e grava. Em corrida com outro comando, relê e valida de novo. */
  private async execute(
    ref: RoundRef,
    decide: (state: RoundState) => { actor: Actor; data: RoundEventData },
  ): Promise<RoundState> {
    for (let attempt = 1; ; attempt++) {
      const { events, version } = await this.deps.store.read(ref);
      const now = this.deps.clock.now();
      const { actor, data } = decide(projectRound(ref, events, now));
      const event = { ...data, id: this.deps.ids.next(), ref, at: now, actor };
      try {
        await this.deps.store.append(ref, [event], version);
        return projectRound(ref, [...events, event], now);
      } catch (e) {
        if (!(e instanceof ConcurrencyError)) throw e;
        if (attempt >= MAX_ATTEMPTS) throw new CommandRejected('concurrency', 'Muitas alterações simultâneas; tente de novo');
      }
    }
  }
}
