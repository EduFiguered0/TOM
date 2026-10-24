import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import { GetCommand, PutCommand, TransactWriteCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { ConcurrencyError, type CurrentRound, type EventRegistry, type TournamentEvent } from '@tom/core';

const DAY_SECONDS = 86_400;

export interface DynamoEventRegistryOptions {
  tableName: string;
  /** Prazo até o TTL apagar o evento. LGPD: 730 dias. */
  retentionDays?: number;
}

type Stored<T, K extends keyof T> = Omit<T, K> & Record<K, string>;
type StoredEvent = Stored<TournamentEvent, 'createdAt'>;
type StoredCurrent = Stored<CurrentRound, 'updatedAt'>;

const eventKey = (id: string) => ({ pk: `event#${id}`, sk: 'event' });
const tokenKey = (hash: string) => ({ pk: `token#${hash}`, sk: 'token' });
const CURRENT = { pk: 'current', sk: 'current' };

/** Evento (com versão), trava do hash do token (acha o evento pelo token) e ponteiro da rodada atual. */
export class DynamoEventRegistry implements EventRegistry {
  private readonly tableName: string;
  private readonly retentionSeconds: number;

  constructor(private readonly client: DynamoDBDocumentClient, { tableName, retentionDays = 730 }: DynamoEventRegistryOptions) {
    this.tableName = tableName;
    this.retentionSeconds = retentionDays * DAY_SECONDS;
  }

  async get(id: string) {
    const item = await this.item(eventKey(id));
    return item ? { event: fromStored(item['event'] as StoredEvent), version: item['version'] as number } : null;
  }

  async findByTokenHash(tokenHash: string) {
    const lock = await this.item(tokenKey(tokenHash));
    return lock ? this.get(lock['eventId'] as string) : null;
  }

  async save(event: TournamentEvent, expectedVersion: number): Promise<number> {
    const version = expectedVersion + 1;
    const expiresAt = Math.floor(Date.now() / 1000) + this.retentionSeconds;
    const eventPut = {
      Put: {
        TableName: this.tableName,
        Item: { ...eventKey(event.id), version, event: { ...event, createdAt: event.createdAt.toISOString() }, expiresAt },
        ConditionExpression: expectedVersion === 0 ? 'attribute_not_exists(pk)' : 'version = :expected',
        ...(expectedVersion === 0 ? {} : { ExpressionAttributeValues: { ':expected': expectedVersion } }),
      },
    };
    // O hash do token nunca muda: a trava só é gravada na criação.
    const tokenPut = expectedVersion === 0
      ? [{ Put: { TableName: this.tableName, Item: { ...tokenKey(event.tokenHash), eventId: event.id, expiresAt }, ConditionExpression: 'attribute_not_exists(pk)' } }]
      : [];
    try {
      await this.client.send(new TransactWriteCommand({ TransactItems: [eventPut, ...tokenPut] }));
    } catch (error) {
      if (error instanceof TransactionCanceledException && error.CancellationReasons?.[0]?.Code === 'ConditionalCheckFailed') {
        throw new ConcurrencyError('Evento alterado por outra gravação');
      }
      throw error;
    }
    return version;
  }

  async setCurrent(current: CurrentRound): Promise<void> {
    const stored: StoredCurrent = { ...current, updatedAt: current.updatedAt.toISOString() };
    await this.client.send(new PutCommand({ TableName: this.tableName, Item: { ...CURRENT, current: stored } }));
  }

  async current(): Promise<CurrentRound | null> {
    const item = await this.item(CURRENT);
    const stored = item?.['current'] as StoredCurrent | undefined;
    return stored ? { ...stored, updatedAt: new Date(stored.updatedAt) } : null;
  }

  private async item(key: Record<string, string>) {
    const { Item } = await this.client.send(new GetCommand({ TableName: this.tableName, Key: key, ConsistentRead: true }));
    return Item;
  }
}

const fromStored = (stored: StoredEvent): TournamentEvent => ({ ...stored, createdAt: new Date(stored.createdAt) });
