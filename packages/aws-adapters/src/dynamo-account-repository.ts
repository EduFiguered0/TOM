import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import { GetCommand, TransactWriteCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
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

type StoredAccount = Omit<Account, 'createdAt'> & { createdAt: string };

const accountKey = (id: string) => ({ pk: `account#${id}`, sk: 'account' });
const lockKey = (playerId: string) => ({ pk: `playerId#${playerId}`, sk: 'playerId' });
const confirmedId = (account: Account) => (account.playerId?.confirmed ? account.playerId.value : null);

/**
 * Itens na mesma tabela: a conta (com a versão), os eventos de auditoria e a trava
 * `playerId#…` que impede o mesmo Player ID confirmado em duas contas.
 */
export class DynamoAccountRepository implements AccountRepository {
  private readonly tableName: string;
  private readonly retentionSeconds: number;

  constructor(private readonly client: DynamoDBDocumentClient, { tableName, retentionDays = 730 }: DynamoAccountRepositoryOptions) {
    this.tableName = tableName;
    this.retentionSeconds = retentionDays * DAY_SECONDS;
  }

  async get(id: string): Promise<AccountRecord | null> {
    const { Item } = await this.client.send(new GetCommand({ TableName: this.tableName, Key: accountKey(id), ConsistentRead: true }));
    return Item ? { account: fromStored(Item['account'] as StoredAccount), version: Item['version'] as number } : null;
  }

  async findByConfirmedPlayerId(playerId: PlayerId): Promise<Account | null> {
    const { Item } = await this.client.send(new GetCommand({ TableName: this.tableName, Key: lockKey(playerId), ConsistentRead: true }));
    if (!Item) return null;
    const record = await this.get(Item['accountId'] as string);
    return record && confirmedId(record.account) === playerId ? record.account : null;
  }

  async save(account: Account, events: readonly IdentityEvent[], expectedVersion: number): Promise<number> {
    const current = await this.get(account.id);
    if ((current?.version ?? 0) !== expectedVersion) {
      throw new ConcurrencyError(`Versão esperada ${String(expectedVersion)}, atual ${String(current?.version ?? 0)}`);
    }
    const version = expectedVersion + 1;
    const expiresAt = Math.floor(Date.now() / 1000) + this.retentionSeconds;
    const [before, after] = [current ? confirmedId(current.account) : null, confirmedId(account)];

    const accountPut = {
      Put: {
        TableName: this.tableName,
        Item: { ...accountKey(account.id), version, account: toStored(account), expiresAt },
        ConditionExpression: expectedVersion === 0 ? 'attribute_not_exists(pk)' : 'version = :expected',
        ...(expectedVersion === 0 ? {} : { ExpressionAttributeValues: { ':expected': expectedVersion } }),
      },
    };
    const lockPut = after
      ? [{
          Put: {
            TableName: this.tableName,
            Item: { ...lockKey(after), accountId: account.id, expiresAt },
            ConditionExpression: 'attribute_not_exists(pk) OR accountId = :me',
            ExpressionAttributeValues: { ':me': account.id },
          },
        }]
      : [];
    const lockRelease = before && before !== after ? [{ Delete: { TableName: this.tableName, Key: lockKey(before) } }] : [];
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
      await this.client.send(new TransactWriteCommand({ TransactItems: [accountPut, ...lockPut, ...lockRelease, ...eventPuts] }));
    } catch (error) {
      if (!(error instanceof TransactionCanceledException)) throw error;
      const [accountReason, lockReason] = error.CancellationReasons ?? [];
      if (accountReason?.Code === 'ConditionalCheckFailed') throw new ConcurrencyError('Conta alterada por outra gravação');
      if (lockPut.length && lockReason?.Code === 'ConditionalCheckFailed') {
        throw new PlayerIdTakenError(`Player ID ${after ?? ''} já confirmado em outra conta`);
      }
      throw error;
    }
    return version;
  }
}

const toStored = (account: Account): StoredAccount => ({ ...account, createdAt: account.createdAt.toISOString() });

const fromStored = (stored: StoredAccount): Account => ({ ...stored, createdAt: new Date(stored.createdAt) });
