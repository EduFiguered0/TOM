import { ConcurrencyError } from '../shared/concurrency-error.js';
import type { PlayerId } from '../shared/player-id.js';
import type { Account, IdentityEvent } from './account.js';
import { AccountConflictError, PlayerIdTakenError, type AccountRecord, type AccountRepository } from './account-repository.js';

const confirmedId = (account: Account) => (account.playerId?.confirmed ? account.playerId.value : null);

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

  async findByConfirmedPlayerId(playerId: PlayerId): Promise<Account | null> {
    return (await this.find((a) => confirmedId(a) === playerId))?.account ?? null;
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
    const playerId = confirmedId(account);
    if (playerId && others.some((a) => confirmedId(a) === playerId)) {
      return Promise.reject(new PlayerIdTakenError(`Player ID ${playerId} já confirmado em outra conta`));
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
