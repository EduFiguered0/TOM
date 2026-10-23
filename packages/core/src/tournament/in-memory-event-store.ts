import { ConcurrencyError, type EventStore, type RoundStream } from './event-store.js';
import type { RoundEvent } from './events.js';
import { streamKey, type RoundRef } from './round-pairing.js';

/** Implementação de referência da porta; usada em testes e desenvolvimento local. */
export class InMemoryEventStore implements EventStore {
  private readonly streams = new Map<string, readonly RoundEvent[]>();

  read(ref: RoundRef): Promise<RoundStream> {
    const events = this.streams.get(streamKey(ref)) ?? [];
    return Promise.resolve({ events, version: events.length });
  }

  append(ref: RoundRef, events: readonly RoundEvent[], expectedVersion: number): Promise<number> {
    const key = streamKey(ref);
    const current = this.streams.get(key) ?? [];
    if (current.length !== expectedVersion) {
      return Promise.reject(
        new ConcurrencyError(`Versão esperada ${String(expectedVersion)}, atual ${String(current.length)}`),
      );
    }
    const next = Object.freeze([...current, ...events.map((e) => Object.freeze({ ...e }))]);
    this.streams.set(key, next);
    return Promise.resolve(next.length);
  }
}
