import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DynamoAccountRepository } from '@tom/aws-adapters';
import { AccountService } from '@tom/core';
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { randomUUID } from 'node:crypto';
import { createApi } from './api.js';
import { CognitoEmailLookup, CognitoTokenVerifier } from './cognito.js';

const env = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`Variável de ambiente ${name} ausente`);
  return value;
};

// Fora do handler: reaproveitado entre execuções da mesma instância.
const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const api = createApi({
  tokens: new CognitoTokenVerifier(env('USER_POOL_ID'), env('USER_POOL_CLIENT_ID')),
  emails: new CognitoEmailLookup(new CognitoIdentityProviderClient({})),
  accounts: new AccountService({
    accounts: new DynamoAccountRepository(dynamo, {
      tableName: env('ACCOUNTS_TABLE'),
      ...(process.env['RETENTION_DAYS'] ? { retentionDays: Number(process.env['RETENTION_DAYS']) } : {}),
    }),
    clock: { now: () => new Date() },
    ids: { next: () => randomUUID() },
  }),
  logError: (error) => { console.error(error); },
});

/** Entrada da Function URL (mesmo formato do API Gateway HTTP API, payload 2.0). */
export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> => {
  const body = event.body && event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf-8') : event.body ?? null;
  const response = await api({
    method: event.requestContext.http.method,
    path: event.rawPath,
    headers: event.headers,
    body,
  });
  return {
    statusCode: response.status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    body: JSON.stringify(response.body),
  };
};
