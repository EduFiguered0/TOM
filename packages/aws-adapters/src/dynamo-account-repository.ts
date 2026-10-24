import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import { GetCommand, ScanCommand, TransactWriteCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  AccountConflictError,
  ConcurrencyError,
  PlayerIdTakenError,
  type Account,
  type AccountRecord,
  type AccountRepository,
  type IdentityEvent,
  type PlayerId,
} from '@tom/core';

const DAY_SECONDS = 86_400;

export interface DynamoAccountRepositoryOptions {
  tableName: string;
  /** Prazo até o TTL apagar conta e eventos sem nova gravação. LGPD: 730 dias. */
  retentionDays?: number;
}

/** Contas de antes do plano 2 guardam o Player ID como `{ value, confirmed }`; só o confirmado tem trava. */
type StoredAccount = Omit<Account, 'createdAt' | 'playerId'> & {
  createdAt: string;
  playerId: PlayerId | { value: PlayerId; confirmed: boolean } | null;
};

/** Travas de unicidade: cada login, o e-mail e o Player ID apontam para uma única conta. */
type LockKind = 'login' | 'email' | 'playerId';
interface Lock { kind: LockKind; value: string }

const accountKey = (id: string) => ({ pk: `account#${id}`, sk: 'account' });
const lockKey = ({ kind, value }: Lock) => ({ pk: `${kind}#${value}`, sk: kind });
const lockId = (lock: Lock) => `${lock.kind}#${lock.value}`;

const locksOf = (account: Account): Lock[] => [
  ...account.logins.map((value) => ({ kind: 'login' as const, value })),
  { kind: 'email', value: account.email },
  ...(account.playerId ? [{ kind: 'playerId' as const, value: account.playerId }] : []),
];

/** Itens na mesma tabela: a conta (com a versão), os eventos de auditoria e as travas de unicidade. */
export class DynamoAccountRepository implements AccountRepository {
  private readonly tableName: string;
  private readonly retentionSeconds: number;

  constructor(private readonly client: DynamoDBDocumentClient, { tableName, retentionDays = 730 }: DynamoAccountRepositoryOptions) {
    this.tableName = tableName;
    this.retentionSeconds = retentionDays * DAY_SECONDS;
  }

  async get(id: string): Promise<AccountRecord | null> {
    const item = await this.item(accountKey(id));
    return item ? { account: fromStored(item['account'] as StoredAccount), version: item['version'] as number } : null;
  }

  findByLogin(login: string): Promise<AccountRecord | null> {
    return this.byLock({ kind: 'login', value: login });
  }

  findByEmail(email: string): Promise<AccountRecord | null> {
    return this.byLock({ kind: 'email', value: email });
  }

  async findByPlayerId(playerId: PlayerId): Promise<AccountRecord | null> {
    const record = await this.byLock({ kind: 'playerId', value: playerId });
    return record?.account.playerId === playerId ? record : null;
  }

  /** Scan da tabela inteira (contas, travas e eventos), filtrando as contas: a loja tem poucas centenas. */
  async all(): Promise<Account[]> {
    const accounts: Account[] = [];
    let start: Record<string, unknown> | undefined;
    do {
      const page = await this.client.send(new ScanCommand({
        TableName: this.tableName,
        FilterExpression: 'sk = :account',
        ExpressionAttributeValues: { ':account': 'account' },
        ExclusiveStartKey: start,
      }));
      accounts.push(...(page.Items ?? []).map((item) => fromStored(item['account'] as StoredAccount)));
      start = page.LastEvaluatedKey;
    } while (start);
    return accounts;
  }

  async save(account: Account, events: readonly IdentityEvent[], expectedVersion: number): Promise<number> {
    const current = await this.get(account.id);
    if ((current?.version ?? 0) !== expectedVersion) {
      throw new ConcurrencyError(`Versão esperada ${String(expectedVersion)}, atual ${String(current?.version ?? 0)}`);
    }
    const version = expectedVersion + 1;
    const expiresAt = Math.floor(Date.now() / 1000) + this.retentionSeconds;
    const before = new Map((current ? locksOf(current.account) : []).map((l) => [lockId(l), l]));
    const after = new Map(locksOf(account).map((l) => [lockId(l), l]));
    const added = [...after.values()].filter((l) => !before.has(lockId(l)));
    const removed = [...before.values()].filter((l) => !after.has(lockId(l)));

    const accountPut = {
      Put: {
        TableName: this.tableName,
        Item: { ...accountKey(account.id), version, account: toStored(account), expiresAt },
        ConditionExpression: expectedVersion === 0 ? 'attribute_not_exists(pk)' : 'version = :expected',
        ...(expectedVersion === 0 ? {} : { ExpressionAttributeValues: { ':expected': expectedVersion } }),
      },
    };
    const lockPuts = added.map((lock) => ({
      Put: {
        TableName: this.tableName,
        Item: { ...lockKey(lock), accountId: account.id, expiresAt },
        ConditionExpression: 'attribute_not_exists(pk) OR accountId = :me',
        ExpressionAttributeValues: { ':me': account.id },
      },
    }));
    // Só apaga a trava que é desta conta.
    const lockDeletes = removed.map((lock) => ({
      Delete: {
        TableName: this.tableName,
        Key: lockKey(lock),
        ConditionExpression: 'attribute_not_exists(pk) OR accountId = :me',
        ExpressionAttributeValues: { ':me': account.id },
      },
    }));
    const eventPuts = events.map((event) => ({
      Put: {
        TableName: this.tableName,
        Item: {
          pk: accountKey(account.id).pk,
          sk: `event#${event.at.toISOString()}#${event.id}`,
          type: event.type,
          event: { ...event, at: event.at.toISOString() },
          expiresAt: Math.floor(event.at.getTime() / 1000) + this.retentionSeconds,
        },
      },
    }));

    try {
      await this.client.send(new TransactWriteCommand({ TransactItems: [accountPut, ...lockPuts, ...lockDeletes, ...eventPuts] }));
    } catch (error) {
      if (!(error instanceof TransactionCanceledException)) throw error;
      const reasons = error.CancellationReasons ?? [];
      const failed = (i: number) => reasons[i]?.Code === 'ConditionalCheckFailed';
      if (failed(0)) throw new ConcurrencyError('Conta alterada por outra gravação');
      const lock = added.find((_, i) => failed(i + 1));
      if (lock?.kind === 'playerId') throw new PlayerIdTakenError(`Player ID ${lock.value} já pertence a outra conta`);
      if (lock) throw new AccountConflictError(`${lock.kind === 'email' ? 'E-mail' : 'Login'} já pertence a outra conta`);
      throw error;
    }
    return version;
  }

  private async item(key: Record<string, string>) {
    const { Item } = await this.client.send(new GetCommand({ TableName: this.tableName, Key: key, ConsistentRead: true }));
    return Item;
  }

  private async byLock(lock: Lock): Promise<AccountRecord | null> {
    const item = await this.item(lockKey(lock));
    return item ? this.get(item['accountId'] as string) : null;
  }
}

const toStored = (account: Account): StoredAccount => ({ ...account, createdAt: account.createdAt.toISOString() });

export const fromStored = (stored: StoredAccount): Account => {
  const { playerId } = stored;
  return {
    ...stored,
    // Pendente antigo não tem trava (pode haver outro com o mesmo valor): volta a não ter Player ID e informa de novo.
    playerId: playerId !== null && typeof playerId === 'object' ? (playerId.confirmed ? playerId.value : null) : playerId,
    createdAt: new Date(stored.createdAt),
  };
};
