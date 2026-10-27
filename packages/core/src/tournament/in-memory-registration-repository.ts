import { byInscription, EventStatusChangedError, type Registration, type RegistrationRepository } from './registration.js';
import type { EventRegistry, EventStatus } from './tournament-event.js';

/** Implementação de referência da porta; a guarda lê o status no registro de eventos. */
export class InMemoryRegistrationRepository implements RegistrationRepository {
  private readonly items = new Map<string, Registration>();

  constructor(private readonly registry: EventRegistry) {}

  list(eventId: string): Promise<Registration[]> {
    return Promise.resolve([...this.items.values()].filter((r) => r.eventId === eventId).sort(byInscription).map((r) => structuredClone(r)));
  }

  get(eventId: string, accountId: string): Promise<Registration | null> {
    const found = this.items.get(`${eventId}#${accountId}`);
    return Promise.resolve(found ? structuredClone(found) : null);
  }

  update(eventId: string, accountId: string, change: Partial<Registration>): Promise<Registration | null> {
    const key = `${eventId}#${accountId}`;
    const found = this.items.get(key);
    if (!found) return Promise.resolve(null);
    const next = { ...found, ...change };
    this.items.set(key, structuredClone(next));
    return Promise.resolve(structuredClone(next));
  }

  listByAccount(accountId: string): Promise<Registration[]> {
    return Promise.resolve([...this.items.values()].filter((r) => r.accountId === accountId).map((r) => structuredClone(r)));
  }

  async put(registration: Registration, guard: EventStatus | null): Promise<void> {
    if (guard && (await this.registry.get(registration.eventId))?.event.status !== guard) {
      throw new EventStatusChangedError(`O evento não está mais em "${guard}"`);
    }
    this.items.set(`${registration.eventId}#${registration.accountId}`, structuredClone(registration));
  }
}
