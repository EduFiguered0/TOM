import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import { GetCommand, PutCommand, TransactWriteCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { ConcurrencyError, DEFAULT_ROUND_MINUTES, type CurrentRound, type EventRegistry, type FinalStanding, type TournamentEvent } from '@tom/core';

const DAY_SECONDS = 86_400;
/** Brasília, sem horário de verão: o dia do evento é o dia local da loja. */
const LOCAL_OFFSET_MS = -3 * 3_600_000;

export interface DynamoEventRegistryOptions {
  tableName: string;
  /** Prazo até o TTL apagar o evento. LGPD: 730 dias. */
  retentionDays?: number;
}

type Stored<T, K extends keyof T> = Omit<T, K> & Record<K, string>;
/** Eventos antigos não têm os campos que vieram depois (escala, fase, data, tempo, código, classificação). */
type Tiebreaks = 'points' | 'opponentWinPct' | 'opponentsOpponentWinPct';
/** Eventos gravados antes dos desempates não têm esses campos. */
type StoredStanding = Omit<FinalStanding, Tiebreaks> & Partial<Pick<FinalStanding, Tiebreaks>>;
type StoredEvent = Omit<Stored<TournamentEvent, 'createdAt'>, 'judges' | 'date' | 'roundMinutes' | 'status' | 'code' | 'standings'>
  & Partial<Pick<TournamentEvent, 'judges' | 'date' | 'roundMinutes' | 'code'>>
  & { status?: TournamentEvent['status'] | 'confirming'; standings?: StoredStanding[] | null };
type StoredCurrent = Stored<CurrentRound, 'updatedAt'>;

const eventKey = (id: string) => ({ pk: `event#${id}`, sk: 'event' });
const tokenKey = (hash: string) => ({ pk: `token#${hash}`, sk: 'token' });
const codeKey = (code: string) => ({ pk: `code#${code}`, sk: 'code' });
const CURRENT = { pk: 'current', sk: 'current' };
const LATEST = { pk: 'latest', sk: 'latest' };

const failed = (error: unknown, index: number) =>
  error instanceof TransactionCanceledException && error.CancellationReasons?.[index]?.Code === 'ConditionalCheckFailed';

/**
 * Evento (com versão), travas do token e do código do QR (acham o evento), ponteiro `latest`
 * (último criado: um ativo por vez) e ponteiro da rodada atual.
 */
export class DynamoEventRegistry implements EventRegistry {
  private readonly tableName: string;
  private readonly retentionSeconds: number;

  constructor(private readonly client: DynamoDBDocumentClient, { tableName, retentionDays = 730 }: DynamoEventRegistryOptions) {
    this.tableName = tableName;
    this.retentionSeconds = retentionDays * DAY_SECONDS;
  }

  async get(id: string) {
    const item = await this.item(eventKey(id));
    return item ? { event: eventFromStored(item['event'] as StoredEvent), version: item['version'] as number } : null;
  }

  async findByTokenHash(tokenHash: string) {
    const lock = await this.item(tokenKey(tokenHash));
    return lock ? this.get(lock['eventId'] as string) : null;
  }

  async findByCode(code: string) {
    const lock = await this.item(codeKey(code));
    return lock ? this.get(lock['eventId'] as string) : null;
  }

  async latest() {
    const pointer = await this.item(LATEST);
    return pointer ? this.get(pointer['eventId'] as string) : null;
  }

  async save(event: TournamentEvent, expectedVersion: number): Promise<number> {
    const version = expectedVersion + 1;
    const expiresAt = this.expiresAt();
    const eventPut = {
      Put: {
        TableName: this.tableName,
        Item: { ...eventKey(event.id), version, event: toStored(event), expiresAt },
        ConditionExpression: expectedVersion === 0 ? 'attribute_not_exists(pk)' : 'version = :expected',
        ...(expectedVersion === 0 ? {} : { ExpressionAttributeValues: { ':expected': expectedVersion } }),
      },
    };
    // O hash do token nunca muda: a trava só é gravada na criação.
    const tokenPut = expectedVersion === 0 ? [this.lockPut(tokenKey(event.tokenHash), event.id, expiresAt)] : [];
    try {
      await this.client.send(new TransactWriteCommand({ TransactItems: [eventPut, ...tokenPut] }));
    } catch (error) {
      if (failed(error, 0)) throw new ConcurrencyError('Evento alterado por outra gravação');
      throw error;
    }
    return version;
  }

  async create(event: TournamentEvent, previousLatest: string | null): Promise<void> {
    const expiresAt = this.expiresAt();
    const items = [
      {
        Put: {
          TableName: this.tableName,
          Item: { ...eventKey(event.id), version: 1, event: toStored(event), expiresAt },
          ConditionExpression: 'attribute_not_exists(pk)',
        },
      },
      {
        // O ponteiro só anda se ninguém criou outro evento no meio: garante um ativo por vez.
        Put: {
          TableName: this.tableName,
          Item: { ...LATEST, eventId: event.id },
          ConditionExpression: previousLatest === null ? 'attribute_not_exists(pk)' : 'eventId = :prev',
          ...(previousLatest === null ? {} : { ExpressionAttributeValues: { ':prev': previousLatest } }),
        },
      },
      this.lockPut(tokenKey(event.tokenHash), event.id, expiresAt),
      ...(event.code ? [this.lockPut(codeKey(event.code), event.id, expiresAt)] : []),
    ];
    try {
      await this.client.send(new TransactWriteCommand({ TransactItems: items }));
    } catch (error) {
      if (failed(error, 1)) throw new ConcurrencyError('Outro evento foi criado ao mesmo tempo');
      throw error;
    }
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

  private expiresAt() {
    return Math.floor(Date.now() / 1000) + this.retentionSeconds;
  }

  private lockPut(key: Record<string, string>, eventId: string, expiresAt: number) {
    return { Put: { TableName: this.tableName, Item: { ...key, eventId, expiresAt }, ConditionExpression: 'attribute_not_exists(pk)' } };
  }

  private async item(key: Record<string, string>) {
    const { Item } = await this.client.send(new GetCommand({ TableName: this.tableName, Key: key, ConsistentRead: true }));
    return Item;
  }
}

const toStored = (event: TournamentEvent) => ({ ...event, createdAt: event.createdAt.toISOString() });

const localDate = (at: Date) => new Date(at.getTime() + LOCAL_OFFSET_MS).toISOString().slice(0, 10);

/**
 * Evento antigo: sem escala, 30 min, sem código, e encerrado (não bloqueia a criação do próximo).
 * "Confirmando presença" (fase extinta) volta a inscrições abertas.
 */
export const eventFromStored = (stored: StoredEvent): TournamentEvent => {
  const createdAt = new Date(stored.createdAt);
  return {
    ...stored,
    createdAt,
    judges: stored.judges ?? [],
    date: stored.date ?? localDate(createdAt),
    roundMinutes: stored.roundMinutes ?? DEFAULT_ROUND_MINUTES,
    status: stored.status === 'confirming' ? 'open' : stored.status ?? 'closed',
    code: stored.code ?? null,
    standings: stored.standings?.map((s) => ({
      ...s, points: s.points ?? null, opponentWinPct: s.opponentWinPct ?? null, opponentsOpponentWinPct: s.opponentsOpponentWinPct ?? null,
    })) ?? null,
  };
};
