import { GetCommand, PutCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { PhotoStore } from '@tom/core';

const DAY_SECONDS = 86_400;

/**
 * Fotos (data URL de 128×128, ~10 KB) na tabela `Tournaments` (`pk = photo#<chave>`): sem bucket nem permissão nova.
 * A chave muda a cada troca; a antiga expira pela TTL.
 */
export class DynamoPhotoStore implements PhotoStore {
  private readonly retentionSeconds: number;

  constructor(private readonly client: DynamoDBDocumentClient, private readonly options: { tableName: string; retentionDays?: number }) {
    this.retentionSeconds = (options.retentionDays ?? 730) * DAY_SECONDS;
  }

  async put(id: string, dataUrl: string): Promise<void> {
    await this.client.send(new PutCommand({
      TableName: this.options.tableName,
      Item: { pk: `photo#${id}`, sk: 'photo', dataUrl, expiresAt: Math.floor(Date.now() / 1000) + this.retentionSeconds },
    }));
  }

  async get(id: string): Promise<string | null> {
    const { Item } = await this.client.send(new GetCommand({ TableName: this.options.tableName, Key: { pk: `photo#${id}`, sk: 'photo' } }));
    return (Item?.['dataUrl'] as string | undefined) ?? null;
  }
}
