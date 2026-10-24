import { ConcurrencyError } from '../shared/concurrency-error.js';
import type { CurrentRound, EventRegistry, TournamentEvent } from './tournament-event.js';

/** Implementação de referência da porta; usada em testes e desenvolvimento local. */
export class InMemoryEventRegistry implements EventRegistry {
  private readonly events = new Map<string, { event: TournamentEvent; version: number }>();
  private pointer: CurrentRound | null = null;

  get(id: string) {
    const found = this.events.get(id);
    return Promise.resolve(found ? structuredClone(found) : null);
  }

  findByTokenHash(tokenHash: string) {
    const found = [...this.events.values()].find((r) => r.event.tokenHash === tokenHash);
    return Promise.resolve(found ? structuredClone(found) : null);
  }

  save(event: TournamentEvent, expectedVersion: number): Promise<number> {
    const current = this.events.get(event.id)?.version ?? 0;
    if (current !== expectedVersion) {
      return Promise.reject(new ConcurrencyError(`Versão esperada ${String(expectedVersion)}, atual ${String(current)}`));
    }
    this.events.set(event.id, { event: structuredClone(event), version: current + 1 });
    return Promise.resolve(current + 1);
  }

  setCurrent(current: CurrentRound): Promise<void> {
    this.pointer = structuredClone(current);
    return Promise.resolve();
  }

  current(): Promise<CurrentRound | null> {
    return Promise.resolve(this.pointer ? structuredClone(this.pointer) : null);
  }
}
