import type { AccountRepository } from '../identity/account-repository.js';
import { DEFAULT_ROUND_MINUTES } from '../results/deadline.js';
import type { Actor } from '../shared/actor.js';
import { CommandRejected } from '../shared/command-rejected.js';
import { ConcurrencyError } from '../shared/concurrency-error.js';
import type { Clock, IdGenerator } from '../shared/ports.js';
import type { RegistrationRepository } from './registration.js';
import {
  ACTIVE_STATUSES,
  hashToken,
  newEventCode,
  newUploadToken,
  type EventRegistry,
  type EventStatus,
  type FinalStanding,
  type TournamentEvent,
} from './tournament-event.js';

export interface EventServiceDeps {
  events: EventRegistry;
  /** Para conferir que cada juiz escalado é da equipe. */
  accounts: AccountRepository;
  /** Inscrito no evento não é escalado como juiz. */
  registrations: RegistrationRepository;
  clock: Clock;
  ids: IdGenerator;
}

export interface CreateEventInput {
  label: string;
  /** `YYYY-MM-DD`; ausente = hoje (horário de Brasília). */
  date?: string;
  roundMinutes?: number;
  judges?: readonly string[];
}

export interface EventChange {
  roundMinutes?: number;
  judges?: readonly string[];
}

const MAX_ATTEMPTS = 3;
const LOCAL_OFFSET_MS = -3 * 3_600_000;
const MIN_ROUND = 10;
const MAX_ROUND = 180;

const requireAdmin = (actor: Actor | null): Actor => {
  if (actor?.role !== 'admin') throw new CommandRejected('forbidden', 'Só o ADM pode executar esta ação');
  return actor;
};

const actorId = (actor: Actor) => (actor.role === 'system' ? actor.source : actor.accountId);

const isActive = (event: TournamentEvent) => ACTIVE_STATUSES.includes(event.status);

const ended = () => new CommandRejected('event_state', 'Evento encerrado ou cancelado não muda');

const validDate = (date: string): string => {
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T12:00:00Z`) : null;
  if (!parsed || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new CommandRejected('invalid_input', 'Data inválida');
  }
  return date;
};

const validMinutes = (minutes: number): number => {
  if (!Number.isInteger(minutes) || minutes < MIN_ROUND || minutes > MAX_ROUND) {
    throw new CommandRejected('invalid_input', `Tempo de rodada deve ser de ${String(MIN_ROUND)} a ${String(MAX_ROUND)} minutos`);
  }
  return minutes;
};

/** Eventos e tokens do enviador: o ADM cria, conduz as fases e encerra; o enviador só envia com token válido. */
export class EventService {
  constructor(private readonly deps: EventServiceDeps) {}

  /** O token volta só aqui, uma vez; o banco guarda apenas o hash. Um evento ativo por vez. */
  async createEvent(actor: Actor | null, input: CreateEventInput): Promise<{ event: TournamentEvent; token: string }> {
    const admin = requireAdmin(actor);
    const name = input.label.trim();
    if (name.length < 2 || name.length > 100) throw new CommandRejected('invalid_input', 'Nome do evento deve ter de 2 a 100 caracteres');
    const now = this.deps.clock.now();
    const date = validDate(input.date ?? new Date(now.getTime() + LOCAL_OFFSET_MS).toISOString().slice(0, 10));
    const roundMinutes = validMinutes(input.roundMinutes ?? DEFAULT_ROUND_MINUTES);
    const judges = await this.teamJudges(input.judges ?? []);
    for (let attempt = 1; ; attempt++) {
      const latest = await this.deps.events.latest();
      if (latest && isActive(latest.event)) {
        throw new CommandRejected('event_active', 'Já existe um evento ativo. Encerre ou cancele antes de criar outro.');
      }
      const token = newUploadToken();
      const event: TournamentEvent = {
        id: this.deps.ids.next(),
        label: name,
        tournament: null,
        tokenHash: await hashToken(token),
        revoked: false,
        createdAt: now,
        createdBy: actorId(admin),
        judges,
        date,
        roundMinutes,
        status: 'open',
        code: newEventCode(),
        standings: null,
        partial: null,
        onTv: false,
      };
      try {
        await this.deps.events.create(event, latest?.event.id ?? null);
        return { event, token };
      } catch (e) {
        // Outro ADM criou junto: relê; se o dele estiver ativo, a próxima volta recusa.
        if (!(e instanceof ConcurrencyError) || attempt >= MAX_ATTEMPTS) throw e;
      }
    }
  }

  /** Evento ativo: o último criado, se ainda não foi encerrado nem cancelado. */
  async active(): Promise<TournamentEvent | null> {
    const latest = await this.deps.events.latest();
    return latest && isActive(latest.event) ? latest.event : null;
  }

  /** O ADM muda o tempo de rodada e os juízes escalados enquanto o evento não acabou. */
  async update(actor: Actor | null, eventId: string, change: EventChange): Promise<TournamentEvent> {
    requireAdmin(actor);
    const roundMinutes = change.roundMinutes === undefined ? undefined : validMinutes(change.roundMinutes);
    const judges = change.judges === undefined ? undefined : await this.teamJudges(change.judges);
    if (judges) {
      const enrolled = await Promise.all(judges.map((id) => this.deps.registrations.get(eventId, id)));
      if (enrolled.some((r) => r && !r.removed)) {
        throw new CommandRejected('invalid_input', 'Essa conta está inscrita no evento. Remova a inscrição antes de escalar.');
      }
    }
    return this.change(eventId, (event) => {
      if (!isActive(event)) throw ended();
      return { ...event, ...(roundMinutes === undefined ? {} : { roundMinutes }), ...(judges === undefined ? {} : { judges }) };
    });
  }

  /** Atalho do plano 3: troca só os juízes escalados. */
  setJudges(actor: Actor | null, eventId: string, judges: readonly string[]): Promise<TournamentEvent> {
    return this.update(actor, eventId, { judges });
  }

  /** A rodada 1 começou. */
  markRunning(eventId: string): Promise<TournamentEvent> {
    return this.move(eventId, ['open'], 'running', 'O evento já está em andamento');
  }

  /** O TOM mandou os standings da última rodada. Antes de o evento começar, não muda nada. */
  markFinal(eventId: string, standings: FinalStanding[]): Promise<TournamentEvent> {
    return this.change(eventId, (event) => (event.status === 'running' || event.status === 'final' ? { ...event, status: 'final', standings } : null));
  }

  /** O TOM mandou os standings de uma rodada intermediária: a TV mostra até o próximo pareamento. */
  markPartial(eventId: string, round: number, standings: FinalStanding[]): Promise<TournamentEvent> {
    return this.change(eventId, (event) => (event.status === 'running' ? { ...event, partial: { round, standings } } : null));
  }

  /** Encerrar limpa a TV: a classificação só volta se o ADM reexibir. */
  async close(actor: Actor | null, eventId: string): Promise<TournamentEvent> {
    requireAdmin(actor);
    await this.move(eventId, ['final'], 'closed', 'O evento só encerra depois do resultado final do TOM');
    return this.change(eventId, (event) => (event.onTv ? { ...event, onTv: false } : null));
  }

  /** Reexibe (ou tira) da TV a classificação final do último evento, já encerrado. */
  async showOnTv(actor: Actor | null, eventId: string, on: boolean): Promise<TournamentEvent> {
    requireAdmin(actor);
    const latest = await this.deps.events.latest();
    const event = latest?.event;
    if (event?.id !== eventId || event.status !== 'closed' || !event.standings) {
      throw new CommandRejected('event_state', 'Só a classificação final do último evento encerrado vai para a TV');
    }
    return this.change(eventId, (current) => (current.onTv === on ? null : { ...current, onTv: on }));
  }

  /** Evento criado por engano ou que nunca recebeu o resultado: não entra no histórico. */
  async cancel(actor: Actor | null, eventId: string): Promise<TournamentEvent> {
    requireAdmin(actor);
    return this.move(eventId, ACTIVE_STATUSES, 'cancelled', 'Evento encerrado ou cancelado não muda');
  }

  async revoke(actor: Actor | null, eventId: string): Promise<TournamentEvent> {
    requireAdmin(actor);
    const record = await this.deps.events.get(eventId);
    if (!record) throw new CommandRejected('event_not_found', 'Evento não encontrado');
    if (record.event.revoked) return record.event;
    const event = { ...record.event, revoked: true };
    await this.deps.events.save(event, record.version);
    return event;
  }

  /**
   * Valida o token do enviador e amarra o evento ao torneio do TOM no primeiro envio.
   * Token desconhecido, revogado ou de evento encerrado/cancelado: recusa. Outro torneio com o mesmo token: recusa.
   */
  async authorizeUpload(token: string, tournament: string): Promise<TournamentEvent> {
    const record = token ? await this.deps.events.findByTokenHash(await hashToken(token)) : null;
    if (!record || record.event.revoked || !isActive(record.event)) {
      throw new CommandRejected('invalid_token', 'Token do enviador inválido ou revogado');
    }
    return this.bind(record, tournament, () => new CommandRejected('tournament_mismatch', `Este token é do torneio "${record.event.tournament ?? ''}", não de "${tournament}"`),
      () => this.authorizeUpload(token, tournament));
  }

  /**
   * Envio pelo navegador do ADM (pasta do TOM conectada no painel): sempre para o evento ativo, sem token.
   * null: arquivo gravado antes de o evento existir e o evento ainda sem torneio. É o torneio anterior que
   * ficou na pasta: não amarra (o primeiro arquivo novo amarra) e o envio é só ignorado.
   */
  async authorizeAdminUpload(actor: Actor | null, tournament: string, modifiedAt?: Date): Promise<TournamentEvent | null> {
    requireAdmin(actor);
    const latest = await this.deps.events.latest();
    if (!latest || !isActive(latest.event)) throw new CommandRejected('event_state', 'Crie o evento para começar a enviar');
    if (latest.event.tournament === null && modifiedAt && modifiedAt < latest.event.createdAt) return null;
    return this.bindAdmin(latest, tournament);
  }

  private bindAdmin(latest: { event: TournamentEvent; version: number }, tournament: string): Promise<TournamentEvent> {
    const bound = latest.event.tournament ?? '';
    return this.bind(latest, tournament, () => new CommandRejected(
      'tournament_mismatch',
      `A pasta está com o torneio ${tournament}, mas este evento é do torneio ${bound}. Abra o torneio ${bound} no TOM.`,
    ), async () => {
      const again = await this.deps.events.latest();
      if (!again || !isActive(again.event)) throw new CommandRejected('event_state', 'Crie o evento para começar a enviar');
      return this.bindAdmin(again, tournament);
    });
  }

  /** O primeiro envio amarra o torneio do TOM ao evento; depois, outro torneio é recusado. */
  private async bind(
    record: { event: TournamentEvent; version: number },
    tournament: string,
    mismatch: () => CommandRejected,
    retry: () => Promise<TournamentEvent>,
  ): Promise<TournamentEvent> {
    const { event, version } = record;
    if (event.tournament === tournament) return event;
    if (event.tournament !== null) throw mismatch();
    const bound = { ...event, tournament };
    try {
      await this.deps.events.save(bound, version);
    } catch (e) {
      // Dois arquivos do mesmo envio chegaram juntos: o outro já amarrou; confere de novo.
      if (e instanceof ConcurrencyError) return retry();
      throw e;
    }
    return bound;
  }

  private move(eventId: string, from: readonly EventStatus[], to: EventStatus, refusal: string): Promise<TournamentEvent> {
    return this.change(eventId, (event) => {
      if (!isActive(event) && to !== 'closed') throw ended();
      if (!from.includes(event.status)) throw new CommandRejected('event_state', refusal);
      return { ...event, status: to };
    });
  }

  /** Lê, decide e grava; repete se outra gravação passou na frente. `null` = nada a mudar. */
  private async change(eventId: string, decide: (event: TournamentEvent) => TournamentEvent | null): Promise<TournamentEvent> {
    for (let attempt = 1; ; attempt++) {
      const record = await this.deps.events.get(eventId);
      if (!record) throw new CommandRejected('event_not_found', 'Evento não encontrado');
      const next = decide(record.event);
      if (!next) return record.event;
      try {
        await this.deps.events.save(next, record.version);
        return next;
      } catch (e) {
        if (!(e instanceof ConcurrencyError)) throw e;
        if (attempt >= MAX_ATTEMPTS) throw new CommandRejected('concurrency', 'Muitas alterações simultâneas; tente de novo');
      }
    }
  }

  /** Sem repetidos; cada id precisa ser conta marcada como juiz da equipe. */
  private async teamJudges(judges: readonly string[]): Promise<string[]> {
    const roster = [...new Set(judges)];
    const accounts = await Promise.all(roster.map((id) => this.deps.accounts.get(id)));
    if (accounts.some((record) => record?.account.judge !== true)) {
      throw new CommandRejected('invalid_input', 'Só juízes da equipe podem ser escalados');
    }
    return roster;
  }
}
