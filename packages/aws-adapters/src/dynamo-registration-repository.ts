import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import { GetCommand, QueryCommand, TransactWriteCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  byInscription,
  EventStatusChangedError,
  splitName,
  type EventStatus,
  type Registration,
  type RegistrationRepository,
} from '@tom/core';

const DAY_SECONDS = 86_400;
const MAX_ATTEMPTS = 5;

export interface DynamoRegistrationRepositoryOptions {
  /** A mesma tabela do registro de eventos (`Tournaments`): a guarda confere o item do evento. */
  tableName: string;
  /** LGPD: 730 dias. */
  retentionDays?: number;
}

type StoredRegistration = Omit<Registration, 'at' | 'awaitingApproval' | 'firstName' | 'lastName' | 'paid'> & {
  paid?: boolean;
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
/** Índice por conta (histórico do jogador): aponta para a inscrição, na mesma tabela; lido com Query. */
const byAccountKey = (accountId: string, eventId: string) => ({ pk: `player#${accountId}`, sk: `reg#${eventId}` });

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

  /** Lê com a versão e regrava só se ninguém gravou no meio (senão relê e aplica de novo). */
  async update(eventId: string, accountId: string, change: Partial<Registration>): Promise<Registration | null> {
    for (let attempt = 1; ; attempt++) {
      const { Item } = await this.client.send(new GetCommand({ TableName: this.tableName, Key: key(eventId, accountId), ConsistentRead: true }));
      if (!Item) return null;
      const version = Item['version'] as number | undefined;
      const next = { ...registrationFromStored(Item['registration'] as StoredRegistration), ...change };
      try {
        await this.write(next, {
          ConditionExpression: version === undefined ? 'attribute_not_exists(#v)' : '#v = :v',
          ExpressionAttributeNames: { '#v': 'version' },
          ...(version === undefined ? {} : { ExpressionAttributeValues: { ':v': version } }),
        }, (version ?? 0) + 1);
        return next;
      } catch (error) {
        const raced = error instanceof TransactionCanceledException && error.CancellationReasons?.[0]?.Code === 'ConditionalCheckFailed';
        if (!raced || attempt >= MAX_ATTEMPTS) throw error;
      }
    }
  }

  /** Inscrição e o índice por conta, juntos; `condition` vale para a inscrição. */
  private async write(registration: Registration, condition: Record<string, unknown>, version: number): Promise<void> {
    const expiresAt = Math.floor(Date.now() / 1000) + this.retentionSeconds;
    const item = { ...key(registration.eventId, registration.accountId), registration: { ...registration, at: registration.at.toISOString() }, version, expiresAt };
    const index = { ...byAccountKey(registration.accountId, registration.eventId), eventId: registration.eventId, expiresAt };
    await this.client.send(new TransactWriteCommand({
      TransactItems: [
        { Put: { TableName: this.tableName, Item: item, ...condition } },
        { Put: { TableName: this.tableName, Item: index } },
      ],
    }));
  }

  async listByAccount(accountId: string): Promise<Registration[]> {
    const eventIds: string[] = [];
    let start: Record<string, unknown> | undefined;
    do {
      const page = await this.client.send(new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'pk = :pk',
        ExpressionAttributeValues: { ':pk': `player#${accountId}` },
        ExclusiveStartKey: start,
      }));
      eventIds.push(...(page.Items ?? []).map((item) => item['eventId'] as string));
      start = page.LastEvaluatedKey;
    } while (start);
    const found = await Promise.all(eventIds.map((eventId) => this.get(eventId, accountId)));
    return found.filter((r) => r !== null);
  }

  async put(registration: Registration, guard: EventStatus | null): Promise<void> {
    const expiresAt = Math.floor(Date.now() / 1000) + this.retentionSeconds;
    const item = {
      ...key(registration.eventId, registration.accountId),
      registration: { ...registration, at: registration.at.toISOString() },
      expiresAt,
    };
    const index = { ...byAccountKey(registration.accountId, registration.eventId), eventId: registration.eventId, expiresAt };
    if (!guard) {
      await this.client.send(new TransactWriteCommand({
        TransactItems: [{ Put: { TableName: this.tableName, Item: item } }, { Put: { TableName: this.tableName, Item: index } }],
      }));
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
          { Put: { TableName: this.tableName, Item: index } },
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
  by: s.by, awaitingApproval: s.awaitingApproval ?? false, launched: s.launched, removed: s.removed, paid: s.paid ?? false,
});
