import type { Account } from '../identity/account.js';
import type { AccountRepository } from '../identity/account-repository.js';
import type { Principal } from '../identity/account-service.js';
import type { Actor } from '../shared/actor.js';
import { CommandRejected } from '../shared/command-rejected.js';
import type { PlayerId } from '../shared/player-id.js';
import type { Clock } from '../shared/ports.js';
import { EventStatusChangedError, type Registration, type RegistrationRepository } from './registration.js';
import { ACTIVE_STATUSES, type EventRegistry, type EventStatus, type TournamentEvent } from './tournament-event.js';

export interface RegistrationServiceDeps {
  registry: EventRegistry;
  registrations: RegistrationRepository;
  accounts: AccountRepository;
  clock: Clock;
}

/** Fases em que o QR e o ADM ainda inscrevem (o QR só fecha com o resultado final). */
const JOIN_STATUSES: readonly EventStatus[] = ['open', 'running'];

function requireAdmin(actor: Actor | null): asserts actor is Actor {
  if (actor?.role !== 'admin') throw new CommandRejected('forbidden', 'Só o ADM pode executar esta ação');
}

const closed = () => new CommandRejected('event_state', 'Inscrições encerradas');
const removedRejection = () => new CommandRejected('forbidden', 'Sua inscrição foi removida, procure o ADM');
const judgeRejection = () => new CommandRejected('forbidden', 'Você é juiz deste evento');
const incomplete = () => new CommandRejected('invalid_input', 'Complete o cadastro com o Player ID para se inscrever');

/**
 * Inscrição pelo QR, entrada tardia aprovada pelo ADM e o painel de inscritos do ADM. A lista serve para o ADM
 * digitar no TOM; quem reporta continua sendo quem está nas guias.
 */
export class RegistrationService {
  constructor(private readonly deps: RegistrationServiceDeps) {}

  /**
   * Fim do caminho do QR (depois do login e do cadastro): inscreve sozinho; de novo, só devolve a inscrição.
   * Depois do início da rodada 1, a inscrição espera o ADM aprovar.
   */
  async join(principal: Principal, code: string): Promise<{ event: TournamentEvent; registration: Registration }> {
    const record = await this.deps.registry.findByCode(code);
    if (!record) throw new CommandRejected('event_not_found', 'Evento não encontrado');
    const { event } = record;
    const { account } = principal;
    if (!account.playerId) throw incomplete();
    if (event.judges.includes(account.id)) throw judgeRejection();
    const existing = await this.deps.registrations.get(event.id, account.id);
    if (existing?.removed) throw removedRejection();
    if (existing) return { event, registration: existing };
    try {
      return { event, registration: await this.enroll(event, account.id, account.playerId, account.profile) };
    } catch (e) {
      if (!(e instanceof EventStatusChangedError)) throw e;
      // A rodada 1 começou entre a leitura e a gravação: tenta de novo, agora aguardando o ADM.
      const again = await this.event(event.id);
      try {
        return { event: again, registration: await this.enroll(again, account.id, account.playerId, account.profile) };
      } catch (retry) {
        // O resultado final chegou no meio: o QR já fechou.
        if (retry instanceof EventStatusChangedError) throw closed();
        throw retry;
      }
    }
  }

  /** Grava a inscrição pelo QR só se o evento ainda estiver no status lido. */
  private async enroll(event: TournamentEvent, accountId: string, playerId: PlayerId, profile: Account['profile']): Promise<Registration> {
    if (!JOIN_STATUSES.includes(event.status)) throw closed();
    const registration: Registration = {
      eventId: event.id,
      accountId,
      playerId,
      firstName: profile.firstName,
      lastName: profile.lastName,
      birthYear: profile.birthYear,
      at: this.deps.clock.now(),
      by: 'self',
      awaitingApproval: event.status === 'running',
      launched: false,
      removed: false,
    };
    await this.deps.registrations.put(registration, event.status);
    return registration;
  }

  /** O ADM inscreve à mão (atrasado, sem celular): nunca espera aprovação. */
  async add(actor: Actor | null, eventId: string, accountId: string): Promise<Registration> {
    requireAdmin(actor);
    const event = await this.event(eventId);
    if (!JOIN_STATUSES.includes(event.status)) throw closed();
    const record = await this.deps.accounts.get(accountId);
    if (!record) throw new CommandRejected('account_not_found', 'Conta não cadastrada');
    const { account } = record;
    if (!account.playerId) throw incomplete();
    if (event.judges.includes(account.id)) throw judgeRejection();
    const existing = await this.deps.registrations.get(eventId, accountId);
    const registration: Registration = {
      eventId,
      accountId,
      playerId: account.playerId,
      firstName: account.profile.firstName,
      lastName: account.profile.lastName,
      birthYear: account.profile.birthYear,
      at: existing?.at ?? this.deps.clock.now(),
      by: 'admin',
      awaitingApproval: false,
      launched: existing?.launched ?? false,
      removed: false,
    };
    await this.deps.registrations.put(registration, null);
    return registration;
  }

  async remove(actor: Actor | null, eventId: string, accountId: string): Promise<Registration> {
    requireAdmin(actor);
    return this.update(eventId, accountId, { removed: true });
  }

  /** Entrada tardia aprovada: o ADM lança no TOM e a pessoa entra no próximo pareamento. */
  async approve(actor: Actor | null, eventId: string, accountId: string): Promise<Registration> {
    requireAdmin(actor);
    return this.update(eventId, accountId, { awaitingApproval: false });
  }

  async setLaunched(actor: Actor | null, eventId: string, accountId: string, launched: boolean): Promise<Registration> {
    requireAdmin(actor);
    return this.update(eventId, accountId, { launched });
  }

  /** Painel de inscritos, inclusive os removidos. */
  async list(actor: Actor | null, eventId: string): Promise<Registration[]> {
    requireAdmin(actor);
    return this.deps.registrations.list(eventId);
  }

  /** Evento ativo e a inscrição da própria conta, para a tela do evento do dia. */
  async mine(principal: Principal): Promise<{ event: TournamentEvent; registration: Registration | null } | null> {
    const latest = await this.deps.registry.latest();
    if (!latest || !ACTIVE_STATUSES.includes(latest.event.status)) return null;
    return { event: latest.event, registration: await this.deps.registrations.get(latest.event.id, principal.account.id) };
  }

  /** Entradas tardias esperando o ADM (as recusadas, removidas, não contam). */
  async awaiting(eventId: string): Promise<number> {
    return (await this.deps.registrations.list(eventId)).filter((r) => !r.removed && r.awaitingApproval).length;
  }

  /** "Desfazer vínculo": a conta errada sai do evento ativo junto com o Player ID. */
  async dropAccount(eventId: string, accountId: string): Promise<void> {
    const registration = await this.deps.registrations.get(eventId, accountId);
    if (registration && !registration.removed) await this.deps.registrations.put({ ...registration, removed: true }, null);
  }

  private async event(eventId: string): Promise<TournamentEvent> {
    const record = await this.deps.registry.get(eventId);
    if (!record) throw new CommandRejected('event_not_found', 'Evento não encontrado');
    return record.event;
  }

  private async update(eventId: string, accountId: string, change: Partial<Registration>): Promise<Registration> {
    const registration = await this.deps.registrations.get(eventId, accountId);
    if (!registration) throw new CommandRejected('account_not_found', 'Inscrição não encontrada');
    const next = { ...registration, ...change };
    await this.deps.registrations.put(next, null);
    return next;
  }
}
