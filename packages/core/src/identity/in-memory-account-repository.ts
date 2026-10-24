import { ConcurrencyError } from '../shared/concurrency-error.js';
import type { PlayerId } from '../shared/player-id.js';
import type { Account, IdentityEvent } from './account.js';
import { AccountConflictError, PlayerIdTakenError, type AccountRecord, type AccountRepository } from './account-repository.js';

/** Implementação de referência da porta; usada em testes e desenvolvimento local. */
export class InMemoryAccountRepository implements AccountRepository {
  private readonly accounts = new Map<string, AccountRecord>();
  readonly events: IdentityEvent[] = [];

  get(id: string): Promise<AccountRecord | null> {
    return this.find((a) => a.id === id);
  }

  findByLogin(login: string): Promise<AccountRecord | null> {
    return this.find((a) => a.logins.includes(login));
  }

  findByEmail(email: string): Promise<AccountRecord | null> {
    return this.find((a) => a.email === email);
  }

  findByPlayerId(playerId: PlayerId): Promise<AccountRecord | null> {
    return this.find((a) => a.playerId === playerId);
  }

  all(): Promise<Account[]> {
    return Promise.resolve([...this.accounts.values()].map((r) => structuredClone(r.account)));
  }

  save(account: Account, events: readonly IdentityEvent[], expectedVersion: number): Promise<number> {
    const current = this.accounts.get(account.id)?.version ?? 0;
    if (current !== expectedVersion) {
      return Promise.reject(new ConcurrencyError(`Versão esperada ${String(expectedVersion)}, atual ${String(current)}`));
    }
    const others = [...this.accounts.values()].map((r) => r.account).filter((a) => a.id !== account.id);
    if (others.some((a) => a.email === account.email || a.logins.some((l) => account.logins.includes(l)))) {
      return Promise.reject(new AccountConflictError('Login ou e-mail já pertence a outra conta'));
    }
    const { playerId } = account;
    if (playerId && others.some((a) => a.playerId === playerId)) {
      return Promise.reject(new PlayerIdTakenError(`Player ID ${playerId} já pertence a outra conta`));
    }
    const version = current + 1;
    this.accounts.set(account.id, { account: structuredClone(account), version });
    this.events.push(...events);
    return Promise.resolve(version);
  }

  private find(match: (account: Account) => boolean): Promise<AccountRecord | null> {
    const found = [...this.accounts.values()].find((r) => match(r.account));
    return Promise.resolve(found ? structuredClone(found) : null);
  }
}
