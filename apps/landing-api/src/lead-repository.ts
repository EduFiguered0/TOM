import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import { GetCommand, QueryCommand, TransactWriteCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { Lead, Utm } from '@tom/landing-core';

/** Aceite (ou recusa) registrado; a lista só cresce, é o histórico de consentimentos. */
export interface ConsentRecord {
  kind: 'terms' | 'privacy' | 'marketing';
  version: string | null;
  sha256: string | null;
  value: boolean;
  at: string;
}

/** Ida para a compra externa. Não é venda: a compra confirmada é outra estrutura, só de fonte confiável. */
export interface IntentRecord {
  intentId: string;
  leadId: string;
  eventId: string;
  at: string;
  utm: Utm;
  status: 'REDIRECTED';
}

export class LeadExistsError extends Error {
  override name = 'LeadExistsError';
}

export class LeadConflictError extends Error {
  override name = 'LeadConflictError';
}

export interface LeadRepository {
  findByGoogleSub(storeId: string, googleSub: string): Promise<Lead | null>;
  /** Lança LeadExistsError se a conta Google já tiver lead nesta loja. */
  create(lead: Lead): Promise<void>;
  /** `lead.version` já incrementada; lança LeadConflictError se outra gravação passou na frente. */
  update(lead: Lead, consents: ConsentRecord[]): Promise<void>;
  latestConsent(storeId: string, leadId: string, kind: ConsentRecord['kind']): Promise<ConsentRecord | null>;
  /** Grava a intenção e renova o prazo de retenção do lead. */
  addIntent(storeId: string, intent: IntentRecord, lead: Lead): Promise<void>;
}

const DAY_SECONDS = 86_400;
const leadPk = (storeId: string, leadId: string) => `store#${storeId}#lead#${leadId}`;
const lockKey = (storeId: string, googleSub: string) => ({ pk: `store#${storeId}#google#${googleSub}`, sk: 'lock' });

const cancelledBy = (error: unknown, codes: string[]) =>
  error instanceof TransactionCanceledException && (error.CancellationReasons ?? []).some((r) => codes.includes(r.Code ?? ''));
const conditionFailed = (error: unknown) => cancelledBy(error, ['ConditionalCheckFailed']);
/** Dois primeiros acessos simultâneos costumam cair em TransactionConflict, não na condição. */
const lostCreateRace = (error: unknown) => cancelledBy(error, ['ConditionalCheckFailed', 'TransactionConflict']);

/** Tabela única por módulo: lead, trava do Google, consentimentos e intenções; tudo com TTL (LGPD: 6 meses). */
export class DynamoLeadRepository implements LeadRepository {
  private readonly tableName: string;
  private readonly retentionSeconds: number;
  private readonly now: () => Date;

  constructor(
    private readonly client: DynamoDBDocumentClient,
    { tableName, retentionDays = 180, now = () => new Date() }: { tableName: string; retentionDays?: number; now?: () => Date },
  ) {
    this.tableName = tableName;
    this.retentionSeconds = retentionDays * DAY_SECONDS;
    this.now = now;
  }

  async findByGoogleSub(storeId: string, googleSub: string): Promise<Lead | null> {
    // Leituras consistentes: o checkout vem milissegundos depois do cadastro.
    const lock = await this.client.send(new GetCommand({ TableName: this.tableName, Key: lockKey(storeId, googleSub), ConsistentRead: true }));
    const leadId: unknown = lock.Item?.['leadId'];
    if (typeof leadId !== 'string') return null;
    const found = await this.client.send(new GetCommand({ TableName: this.tableName, Key: { pk: leadPk(storeId, leadId), sk: 'lead' }, ConsistentRead: true }));
    if (!found.Item) return null;
    const lead = { ...found.Item };
    for (const key of ['pk', 'sk', 'expiresAt']) Reflect.deleteProperty(lead, key);
    return lead as Lead;
  }

  async create(lead: Lead): Promise<void> {
    const expiresAt = this.expiresAt();
    try {
      await this.client.send(new TransactWriteCommand({
        TransactItems: [
          { Put: { TableName: this.tableName, Item: { ...lockKey(lead.storeId, lead.googleSub), leadId: lead.leadId, expiresAt }, ConditionExpression: 'attribute_not_exists(pk)' } },
          { Put: { TableName: this.tableName, Item: this.leadItem(lead, expiresAt), ConditionExpression: 'attribute_not_exists(pk)' } },
        ],
      }));
    } catch (error) {
      if (lostCreateRace(error)) throw new LeadExistsError(`Conta Google já tem lead na loja ${lead.storeId}`);
      throw error;
    }
  }

  async update(lead: Lead, consents: ConsentRecord[]): Promise<void> {
    const expiresAt = this.expiresAt();
    const pk = leadPk(lead.storeId, lead.leadId);
    const fresh = consents.map((c) => ({ pk, sk: `consent#${c.at}#${c.kind}`, ...c, expiresAt }));
    const kept = (await this.consentItems(pk)).filter((c) => !fresh.some((n) => n.sk === c['sk'])).map((c) => ({ ...c, expiresAt }));
    try {
      await this.client.send(new TransactWriteCommand({
        TransactItems: [
          // Trava e consentimentos acompanham o prazo do lead.
          { Put: { TableName: this.tableName, Item: this.leadItem(lead, expiresAt), ConditionExpression: 'version = :prev', ExpressionAttributeValues: { ':prev': lead.version - 1 } } },
          ...[...fresh, ...kept].map((Item) => ({ Put: { TableName: this.tableName, Item } })),
          { Put: { TableName: this.tableName, Item: { ...lockKey(lead.storeId, lead.googleSub), leadId: lead.leadId, expiresAt } } },
        ],
      }));
    } catch (error) {
      if (conditionFailed(error)) throw new LeadConflictError(`Lead ${lead.leadId} mudou durante a gravação`);
      throw error;
    }
  }

  async latestConsent(storeId: string, leadId: string, kind: ConsentRecord['kind']): Promise<ConsentRecord | null> {
    const item = (await this.consentItems(leadPk(storeId, leadId))).find((i) => i['kind'] === kind);
    if (!item) return null;
    return { kind, version: item['version'] as string | null, sha256: item['sha256'] as string | null, value: item['value'] as boolean, at: item['at'] as string };
  }

  async addIntent(storeId: string, intent: IntentRecord, lead: Lead): Promise<void> {
    const expiresAt = this.expiresAt();
    const pk = leadPk(storeId, intent.leadId);
    const consents = await this.consentItems(pk);
    try {
      await this.client.send(new TransactWriteCommand({
        TransactItems: [
          { Put: { TableName: this.tableName, Item: { pk, sk: `intent#${intent.at}#${intent.intentId}`, ...intent, expiresAt } } },
          // Só renova o prazo se ninguém alterou o lead no meio (ex.: outra aba salvando o cadastro).
          { Put: { TableName: this.tableName, Item: this.leadItem(lead, expiresAt), ConditionExpression: 'version = :v', ExpressionAttributeValues: { ':v': lead.version } } },
          { Put: { TableName: this.tableName, Item: { ...lockKey(storeId, lead.googleSub), leadId: lead.leadId, expiresAt } } },
          ...consents.map((c) => ({ Put: { TableName: this.tableName, Item: { ...c, expiresAt } } })),
        ],
      }));
    } catch (error) {
      if (conditionFailed(error)) throw new LeadConflictError(`Lead ${lead.leadId} mudou durante a gravação`);
      throw error;
    }
  }

  /** Histórico de consentimentos, do mais novo ao mais antigo; a prova do aceite vive tanto quanto o lead. */
  private async consentItems(pk: string): Promise<Record<string, unknown>[]> {
    const result = await this.client.send(new QueryCommand({
      TableName: this.tableName,
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
      ExpressionAttributeValues: { ':pk': pk, ':prefix': 'consent#' },
      ScanIndexForward: false,
      ConsistentRead: true,
    }));
    return result.Items ?? [];
  }

  private leadItem(lead: Lead, expiresAt: number) {
    return { pk: leadPk(lead.storeId, lead.leadId), sk: 'lead', ...lead, expiresAt };
  }

  private expiresAt(): number {
    return Math.floor(this.now().getTime() / 1000) + this.retentionSeconds;
  }
}
