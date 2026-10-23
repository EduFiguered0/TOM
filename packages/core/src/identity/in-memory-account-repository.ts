import type { PlayerId } from '../shared/player-id.js';
import { ConcurrencyError } from '../shared/concurrency-error.js';
import type { Account, IdentityEvent } from './account.js';
import { PlayerIdTakenError, type AccountRecord, type AccountRepository } from './account-repository.js';

const confirmedId = (account: Account) => (account.playerId?.confirmed ? account.playerId.value : null);

/** Implementação de referência da porta; usada em testes e desenvolvimento local. */
export class InMemoryAccountRepository implements AccountRepository {
  private readonly accounts = new Map<string, AccountRecord>();
  readonly events: IdentityEvent[] = [];

  get(id: string): Promise<AccountRecord | null> {
    const record = this.accounts.get(id);
    return Promise.resolve(record ? structuredClone(record) : null);
  }

  findByConfirmedPlayerId(playerId: PlayerId): Promise<Account | null> {
    const found = [...this.accounts.values()].find(({ account }) => confirmedId(account) === playerId);
    return Promise.resolve(found ? structuredClone(found.account) : null);
  }

  save(account: Account, events: readonly IdentityEvent[], expectedVersion: number): Promise<number> {
    const current = this.accounts.get(account.id)?.version ?? 0;
    if (current !== expectedVersion) {
      return Promise.reject(new ConcurrencyError(`Versão esperada ${String(expectedVersion)}, atual ${String(current)}`));
    }
    const playerId = confirmedId(account);
    const holder = [...this.accounts.values()].find((r) => r.account.id !== account.id && confirmedId(r.account) === playerId);
    if (playerId && holder) return Promise.reject(new PlayerIdTakenError(`Player ID ${playerId} já confirmado em outra conta`));
    const version = current + 1;
    this.accounts.set(account.id, { account: structuredClone(account), version });
    this.events.push(...events);
    return Promise.resolve(version);
  }
}
