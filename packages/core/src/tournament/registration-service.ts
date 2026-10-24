import type { AccountRepository } from '../identity/account-repository.js';
import type { Principal } from '../identity/account-service.js';
import type { Actor } from '../shared/actor.js';
import { CommandRejected } from '../shared/command-rejected.js';
import type { Clock } from '../shared/ports.js';
import { EventStatusChangedError, type Registration, type RegistrationRepository } from './registration.js';
import { ACTIVE_STATUSES, type EventRegistry, type EventStatus, type TournamentEvent } from './tournament-event.js';

export interface RegistrationServiceDeps {
  registry: EventRegistry;
  registrations: RegistrationRepository;
  accounts: AccountRepository;
  clock: Clock;
}

/** Fases em que o ADM ainda inscreve à mão (atrasados, sem celular). */
const MANUAL_STATUSES: readonly EventStatus[] = ['open', 'confirming', 'running'];

function requireAdmin(actor: Actor | null): asserts actor is Actor {
  if (actor?.role !== 'admin') throw new CommandRejected('forbidden', 'Só o ADM pode executar esta ação');
}

const closed = () => new CommandRejected('event_state', 'Inscrições encerradas');
const removedRejection = () => new CommandRejected('forbidden', 'Sua inscrição foi removida, procure o ADM');
const judgeRejection = () => new CommandRejected('forbidden', 'Você é juiz deste evento');
const incomplete = () => new CommandRejected('invalid_input', 'Complete o cadastro com o Player ID para se inscrever');

/**
 * Inscrição pelo QR, confirmação de presença e o painel de inscritos do ADM. A lista serve para o ADM
 * digitar no TOM; quem reporta continua sendo quem está nas guias.
 */
export class RegistrationService {
  constructor(private readonly deps: RegistrationServiceDeps) {}

  /** Fim do caminho do QR (depois do login e do cadastro): inscreve sozinho; de novo, só devolve a inscrição. */
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
    if (event.status !== 'open') throw closed();
    const registration: Registration = {
      eventId: event.id,
      accountId: account.id,
      playerId: account.playerId,
      name: account.profile.name,
      birthYear: account.profile.birthYear,
      at: this.deps.clock.now(),
      by: 'self',
      confirmed: false,
      launched: false,
      removed: false,
    };
    try {
      await this.deps.registrations.put(registration, 'open');
    } catch (e) {
      // O ADM pediu a confirmação entre a leitura e a gravação: o QR já fechou.
      if (e instanceof EventStatusChangedError) throw closed();
      throw e;
    }
    return { event, registration };
  }

  /** O ADM inscreve à mão; depois de pedida a confirmação, quem chega já está presente. */
  async add(actor: Actor | null, eventId: string, accountId: string): Promise<Registration> {
    requireAdmin(actor);
    const event = await this.event(eventId);
    if (!MANUAL_STATUSES.includes(event.status)) throw closed();
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
      name: account.profile.name,
      birthYear: account.profile.birthYear,
      at: existing?.at ?? this.deps.clock.now(),
      by: 'admin',
      confirmed: existing?.confirmed === true || event.status !== 'open',
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

  /** O próprio jogador confirma pelo celular, quando o ADM pediu. */
  async confirm(principal: Principal, eventId: string): Promise<Registration> {
    const event = await this.event(eventId);
    if (event.status !== 'confirming') throw new CommandRejected('event_state', 'A confirmação de presença não está aberta');
    const registration = await this.deps.registrations.get(eventId, principal.account.id);
    if (!registration) throw new CommandRejected('account_not_found', 'Você não está inscrito neste evento');
    if (registration.removed) throw removedRejection();
    return this.update(eventId, principal.account.id, { confirmed: true });
  }

  /** "Confirmar por ele": presente sem celular. */
  async confirmFor(actor: Actor | null, eventId: string, accountId: string): Promise<Registration> {
    requireAdmin(actor);
    return this.update(eventId, accountId, { confirmed: true });
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

  /** Inscritos que ainda não confirmaram (os removidos não contam). */
  async pending(eventId: string): Promise<number> {
    return (await this.deps.registrations.list(eventId)).filter((r) => !r.removed && !r.confirmed).length;
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
