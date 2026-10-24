import type { Actor } from '../shared/actor.js';
import { CommandRejected } from '../shared/command-rejected.js';
import { ConcurrencyError } from '../shared/concurrency-error.js';
import type { Clock, IdGenerator } from '../shared/ports.js';
import { hashToken, newUploadToken, type EventRegistry, type TournamentEvent } from './tournament-event.js';

export interface EventServiceDeps {
  events: EventRegistry;
  clock: Clock;
  ids: IdGenerator;
}

const requireAdmin = (actor: Actor | null): Actor => {
  if (actor?.role !== 'admin') throw new CommandRejected('forbidden', 'Só o ADM pode executar esta ação');
  return actor;
};

const actorId = (actor: Actor) => (actor.role === 'system' ? actor.source : actor.accountId);

/** Eventos e tokens do enviador: o ADM cria e revoga; o enviador só envia com token válido. */
export class EventService {
  constructor(private readonly deps: EventServiceDeps) {}

  /** O token volta só aqui, uma vez; o banco guarda apenas o hash. */
  async createEvent(actor: Actor | null, label: string): Promise<{ event: TournamentEvent; token: string }> {
    const admin = requireAdmin(actor);
    const name = label.trim();
    if (name.length < 2 || name.length > 100) throw new CommandRejected('invalid_input', 'Nome do evento deve ter de 2 a 100 caracteres');
    const token = newUploadToken();
    const event: TournamentEvent = {
      id: this.deps.ids.next(),
      label: name,
      tournament: null,
      tokenHash: await hashToken(token),
      revoked: false,
      createdAt: this.deps.clock.now(),
      createdBy: actorId(admin),
    };
    await this.deps.events.save(event, 0);
    return { event, token };
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
   * Token desconhecido ou revogado: recusa. Outro torneio com o mesmo token: recusa.
   */
  async authorizeUpload(token: string, tournament: string): Promise<TournamentEvent> {
    const record = token ? await this.deps.events.findByTokenHash(await hashToken(token)) : null;
    if (!record || record.event.revoked) throw new CommandRejected('invalid_token', 'Token do enviador inválido ou revogado');
    const { event, version } = record;
    if (event.tournament === tournament) return event;
    if (event.tournament !== null) {
      throw new CommandRejected('tournament_mismatch', `Este token é do torneio "${event.tournament}", não de "${tournament}"`);
    }
    const bound = { ...event, tournament };
    try {
      await this.deps.events.save(bound, version);
    } catch (e) {
      // Dois arquivos do mesmo envio chegaram juntos: o outro já amarrou; confere de novo.
      if (e instanceof ConcurrencyError) return this.authorizeUpload(token, tournament);
      throw e;
    }
    return bound;
  }
}
