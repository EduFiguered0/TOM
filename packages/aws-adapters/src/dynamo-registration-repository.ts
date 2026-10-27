import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import { GetCommand, PutCommand, QueryCommand, TransactWriteCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  byInscription,
  EventStatusChangedError,
  splitName,
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

type StoredRegistration = Omit<Registration, 'at' | 'awaitingApproval' | 'firstName' | 'lastName'> & {
  at: string;
  awaitingApproval?: boolean;
  confirmed?: boolean;
  /** Inscrição antiga: `name` num campo só. */
  name?: string;
  firstName?: string;
  lastName?: string;
};

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
      items.push(...(page.Items ?? []).map((item) => registrationFromStored(item['registration'] as StoredRegistration)));
      start = page.LastEvaluatedKey;
    } while (start);
    return items.sort(byInscription);
  }

  async get(eventId: string, accountId: string): Promise<Registration | null> {
    const { Item } = await this.client.send(new GetCommand({ TableName: this.tableName, Key: key(eventId, accountId), ConsistentRead: true }));
    return Item ? registrationFromStored(Item['registration'] as StoredRegistration) : null;
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
      // Mesma transação: o QR nunca grava fora do status esperado (ex.: depois do resultado final).
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

/** Inscrição antiga: sem `awaitingApproval` (o `confirmed` sai) e com `name` num campo só (separa no primeiro espaço). */
export const registrationFromStored = (s: StoredRegistration): Registration => ({
  eventId: s.eventId, accountId: s.accountId, playerId: s.playerId,
  ...(s.firstName === undefined ? splitName(s.name ?? '') : { firstName: s.firstName, lastName: s.lastName ?? '' }),
  birthYear: s.birthYear, at: new Date(s.at),
  by: s.by, awaitingApproval: s.awaitingApproval ?? false, launched: s.launched, removed: s.removed,
});
