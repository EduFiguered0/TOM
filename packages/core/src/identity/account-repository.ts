import type { PlayerId } from '../shared/player-id.js';
import type { Account, IdentityEvent } from './account.js';

export interface AccountRecord {
  account: Account;
  /** Quantidade de gravações; usada no controle de concorrência. */
  version: number;
}

export class PlayerIdTakenError extends Error {
  override name = 'PlayerIdTakenError';
}

/**
 * Porta de persistência das contas. `save` grava a conta e os eventos juntos;
 * falha com ConcurrencyError se a versão mudou e com PlayerIdTakenError se o Player ID
 * confirmado já pertence a outra conta. Versão esperada 0 = conta nova.
 */
export interface AccountRepository {
  get(id: string): Promise<AccountRecord | null>;
  findByConfirmedPlayerId(playerId: PlayerId): Promise<Account | null>;
  save(account: Account, events: readonly IdentityEvent[], expectedVersion: number): Promise<number>;
}
