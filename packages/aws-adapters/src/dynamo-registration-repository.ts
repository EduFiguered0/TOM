import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import { GetCommand, PutCommand, QueryCommand, TransactWriteCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  byInscription,
  EventStatusChangedError,
  type EventStatus,
  type Registration,
  type RegistrationRepository,
} from '@tom/core';

const DAY_SECONDS = 86_400;

export interface DynamoRegistrationRepositoryOptions {
  /** A mesma tabela do registro de eventos (`Tournaments`): a guarda confere o item do evento. */
  tableName: string;
  /** LGPD: 730 dias. */
  retentionDays?: number;
}

type StoredRegistration = Omit<Registration, 'at'> & { at: string };

const eventKey = (id: string) => ({ pk: `event#${id}`, sk: 'event' });
const key = (eventId: string, accountId: string) => ({ pk: `event#${eventId}`, sk: `reg#${accountId}` });

/** Uma inscrição por item, junto do evento (mesma partição): lista com uma Query. */
export class DynamoRegistrationRepository implements RegistrationRepository {
  private readonly tableName: string;
  private readonly retentionSeconds: number;

  constructor(private readonly client: DynamoDBDocumentClient, { tableName, retentionDays = 730 }: DynamoRegistrationRepositoryOptions) {
    this.tableName = tableName;
    this.retentionSeconds = retentionDays * DAY_SECONDS;
  }

  async list(eventId: string): Promise<Registration[]> {
    const items: Registration[] = [];
    let start: Record<string, unknown> | undefined;
    do {
      const page = await this.client.send(new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'pk = :pk AND begins_with(sk, :reg)',
        ExpressionAttributeValues: { ':pk': eventKey(eventId).pk, ':reg': 'reg#' },
        ConsistentRead: true,
        ExclusiveStartKey: start,
      }));
      items.push(...(page.Items ?? []).map((item) => fromStored(item['registration'] as StoredRegistration)));
      start = page.LastEvaluatedKey;
    } while (start);
    return items.sort(byInscription);
  }

  async get(eventId: string, accountId: string): Promise<Registration | null> {
    const { Item } = await this.client.send(new GetCommand({ TableName: this.tableName, Key: key(eventId, accountId), ConsistentRead: true }));
    return Item ? fromStored(Item['registration'] as StoredRegistration) : null;
  }

  async put(registration: Registration, guard: EventStatus | null): Promise<void> {
    const item = {
      ...key(registration.eventId, registration.accountId),
      registration: { ...registration, at: registration.at.toISOString() },
      expiresAt: Math.floor(Date.now() / 1000) + this.retentionSeconds,
    };
    if (!guard) {
      await this.client.send(new PutCommand({ TableName: this.tableName, Item: item }));
      return;
    }
    try {
      // Mesma transação: o QR nunca grava depois de o ADM pedir a confirmação.
      await this.client.send(new TransactWriteCommand({
        TransactItems: [
          {
            ConditionCheck: {
              TableName: this.tableName,
              Key: eventKey(registration.eventId),
              ConditionExpression: '#e.#s = :status',
              ExpressionAttributeNames: { '#e': 'event', '#s': 'status' },
              ExpressionAttributeValues: { ':status': guard },
            },
          },
          { Put: { TableName: this.tableName, Item: item } },
        ],
      }));
    } catch (error) {
      if (error instanceof TransactionCanceledException && error.CancellationReasons?.[0]?.Code === 'ConditionalCheckFailed') {
        throw new EventStatusChangedError(`O evento não está mais em "${guard}"`);
      }
      throw error;
    }
  }
}

const fromStored = (stored: StoredRegistration): Registration => ({ ...stored, at: new Date(stored.at) });
