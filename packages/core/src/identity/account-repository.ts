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

/** Login ou e-mail já pertence a outra conta. */
export class AccountConflictError extends Error {
  override name = 'AccountConflictError';
}

/**
 * Porta de persistência das contas. `save` grava a conta e os eventos juntos e garante a unicidade
 * de logins, e-mail e Player ID. Falha com ConcurrencyError se a versão mudou,
 * AccountConflictError se login ou e-mail já é de outra conta e PlayerIdTakenError se o Player ID
 * já é de outra conta. Versão esperada 0 = conta nova.
 */
export interface AccountRepository {
  get(id: string): Promise<AccountRecord | null>;
  findByLogin(login: string): Promise<AccountRecord | null>;
  findByEmail(email: string): Promise<AccountRecord | null>;
  findByPlayerId(playerId: PlayerId): Promise<AccountRecord | null>;
  /** Todas as contas, para a busca da Equipe (são poucas: uma loja). */
  all(): Promise<Account[]>;
  save(account: Account, events: readonly IdentityEvent[], expectedVersion: number): Promise<number>;
}
