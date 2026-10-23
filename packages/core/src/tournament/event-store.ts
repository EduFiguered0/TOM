import type { RoundEvent } from './events.js';
import type { RoundRef } from './round-pairing.js';

export interface RoundStream {
  events: readonly RoundEvent[];
  /** Quantidade de eventos gravados; usada no controle de concorrência. */
  version: number;
}

export class ConcurrencyError extends Error {
  override name = 'ConcurrencyError';
}

/** Porta de persistência. `append` só resolve depois de gravar; falha com ConcurrencyError se a versão mudou. */
export interface EventStore {
  read(ref: RoundRef): Promise<RoundStream>;
  append(ref: RoundRef, events: readonly RoundEvent[], expectedVersion: number): Promise<number>;
}
