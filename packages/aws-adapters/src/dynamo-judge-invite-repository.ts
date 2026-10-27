import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { GetCommand, PutCommand, QueryCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { JudgeInvite, JudgeInviteRepository } from '@tom/core';

/** Fica um dia depois de vencer, para a lista e o histórico; depois a TTL apaga. */
const KEEP_SECONDS = 86_400;
const PK = 'invites';

type StoredInvite = Omit<JudgeInvite, 'createdAt' | 'expiresAt'> & { createdAt: string; expiresAt: string };

const keyOf = (code: string) => ({ pk: PK, sk: `invite#${code}` });

const fromStored = (s: StoredInvite): JudgeInvite => ({ ...s, createdAt: new Date(s.createdAt), expiresAt: new Date(s.expiresAt) });

/**
 * Convites de juiz na tabela `Tournaments` (`pk = invites`): listados com Query. Uso e cancelamento por PutItem
 * condicional, sem permissão nova.
 */
export class DynamoJudgeInviteRepository implements JudgeInviteRepository {
  constructor(private readonly client: DynamoDBDocumentClient, private readonly options: { tableName: string }) {}

  async create(invite: JudgeInvite): Promise<void> {
    await this.save(invite, { ConditionExpression: 'attribute_not_exists(pk)' });
  }

  async get(code: string): Promise<JudgeInvite | null> {
    const { Item } = await this.client.send(new GetCommand({ TableName: this.options.tableName, Key: keyOf(code), ConsistentRead: true }));
    return Item ? fromStored(Item['invite'] as StoredInvite) : null;
  }

  async listAll(): Promise<JudgeInvite[]> {
    const items: JudgeInvite[] = [];
    let start: Record<string, unknown> | undefined;
    do {
      const page = await this.client.send(new QueryCommand({
        TableName: this.options.tableName,
        KeyConditionExpression: 'pk = :pk',
        ExpressionAttributeValues: { ':pk': PK },
        ExclusiveStartKey: start,
      }));
      items.push(...(page.Items ?? []).map((item) => fromStored(item['invite'] as StoredInvite)));
      start = page.LastEvaluatedKey;
    } while (start);
    return items;
  }

  /** Só grava se ninguém usou, não foi cancelado e está no prazo: dois celulares ao mesmo tempo, um só vence. */
  async markUsed(code: string, accountId: string, now: Date): Promise<boolean> {
    const invite = await this.get(code);
    if (!invite || invite.usedBy !== null || invite.cancelled || invite.expiresAt <= now) return false;
    try {
      await this.save({ ...invite, usedBy: accountId }, {
        ConditionExpression: 'attribute_exists(pk) AND used = :no AND cancelled = :no',
        ExpressionAttributeValues: { ':no': false },
      });
      return true;
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) return false;
      throw error;
    }
  }

  /** Só cancela se ninguém usou: um aceite no mesmo instante não perde o registro de quem usou. */
  async cancel(code: string): Promise<void> {
    const invite = await this.get(code);
    if (!invite || invite.usedBy !== null) return;
    try {
      await this.save({ ...invite, cancelled: true }, { ConditionExpression: 'attribute_exists(pk) AND used = :no', ExpressionAttributeValues: { ':no': false } });
    } catch (error) {
      if (!(error instanceof ConditionalCheckFailedException)) throw error;
    }
  }

  private async save(invite: JudgeInvite, condition: Record<string, unknown>): Promise<void> {
    const stored: StoredInvite = { ...invite, createdAt: invite.createdAt.toISOString(), expiresAt: invite.expiresAt.toISOString() };
    await this.client.send(new PutCommand({
      TableName: this.options.tableName,
      // `used` e `cancelled` no topo: a condição de uso único confere os dois.
      Item: {
        ...keyOf(invite.code), invite: stored, used: invite.usedBy !== null, cancelled: invite.cancelled,
        expiresAt: Math.floor(invite.expiresAt.getTime() / 1000) + KEEP_SECONDS,
      },
      ...condition,
    }));
  }
}
