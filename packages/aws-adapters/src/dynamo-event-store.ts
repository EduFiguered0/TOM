import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import {
  paginateQuery,
  TransactWriteCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import {
  ConcurrencyError,
  streamKey,
  type EventStore,
  type RoundEvent,
  type RoundRef,
  type RoundStream,
} from '@tom/core';

const DAY_SECONDS = 86_400;

export interface DynamoEventStoreOptions {
  tableName: string;
  /** Prazo até o TTL apagar o evento, contado do horário do evento. LGPD: 730 dias. */
  retentionDays?: number;
}

type StoredEvent = Omit<RoundEvent, 'at'> & { at: string };

/** Um item por evento: pk = stream da rodada, sk = versão (1, 2, 3...). */
export class DynamoEventStore implements EventStore {
  private readonly tableName: string;
  private readonly retentionSeconds: number;

  constructor(private readonly client: DynamoDBDocumentClient, { tableName, retentionDays = 730 }: DynamoEventStoreOptions) {
    this.tableName = tableName;
    this.retentionSeconds = retentionDays * DAY_SECONDS;
  }

  async read(ref: RoundRef): Promise<RoundStream> {
    const events: RoundEvent[] = [];
    const pages = paginateQuery({ client: this.client }, {
      TableName: this.tableName,
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: { ':pk': streamKey(ref) },
      ConsistentRead: true,
    });
    for await (const page of pages) {
      for (const item of page.Items ?? []) events.push(fromStored(item['event'] as StoredEvent));
    }
    return { events, version: events.length };
  }

  async append(ref: RoundRef, events: readonly RoundEvent[], expectedVersion: number): Promise<number> {
    if (events.length === 0) return this.assertVersion(ref, expectedVersion);
    const pk = streamKey(ref);
    const puts = events.map((event, i) => ({
      Put: {
        TableName: this.tableName,
        Item: {
          pk,
          sk: expectedVersion + i + 1,
          type: event.type,
          at: event.at.toISOString(),
          event: toStored(event),
          expiresAt: Math.floor(event.at.getTime() / 1000) + this.retentionSeconds,
        },
        ConditionExpression: 'attribute_not_exists(pk)',
      },
    }));
    // Sem buracos: a versão esperada precisa existir.
    const previous = expectedVersion > 0
      ? [{ ConditionCheck: { TableName: this.tableName, Key: { pk, sk: expectedVersion }, ConditionExpression: 'attribute_exists(pk)' } }]
      : [];
    try {
      await this.client.send(new TransactWriteCommand({ TransactItems: [...previous, ...puts] }));
    } catch (error) {
      if (isConditionFailure(error)) throw new ConcurrencyError(`Versão esperada ${String(expectedVersion)} desatualizada`);
      throw error;
    }
    return expectedVersion + events.length;
  }

  private async assertVersion(ref: RoundRef, expectedVersion: number): Promise<number> {
    const { version } = await this.read(ref);
    if (version !== expectedVersion) {
      throw new ConcurrencyError(`Versão esperada ${String(expectedVersion)}, atual ${String(version)}`);
    }
    return version;
  }
}

const toStored = (event: RoundEvent): StoredEvent => ({ ...event, at: event.at.toISOString() });

const fromStored = (stored: StoredEvent): RoundEvent => ({ ...stored, at: new Date(stored.at) }) as RoundEvent;

const isConditionFailure = (error: unknown): boolean =>
  error instanceof TransactionCanceledException &&
  (error.CancellationReasons ?? []).some((r) => r.Code === 'ConditionalCheckFailed');
