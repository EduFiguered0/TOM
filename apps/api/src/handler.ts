import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DynamoAccountRepository, DynamoEventRegistry, DynamoEventStore, DynamoRegistrationRepository, S3SnapshotStore } from '@tom/aws-adapters';
import { AccountService, EventService, RegistrationService, RoundService } from '@tom/core';
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { randomUUID } from 'node:crypto';
import { createApi } from './api.js';
import { createBoard } from './board.js';
import { CognitoEmailLookup, CognitoTokenVerifier } from './cognito.js';
import { createIngest } from './ingest.js';
import { createRoundReader } from './rounds.js';

const env = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`Variável de ambiente ${name} ausente`);
  return value;
};

// Fora do handler: reaproveitado entre execuções da mesma instância.
const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const retention = process.env['RETENTION_DAYS'] ? { retentionDays: Number(process.env['RETENTION_DAYS']) } : {};
const clock = { now: () => new Date() };
const ids = { next: () => randomUUID() };

const registry = new DynamoEventRegistry(dynamo, { tableName: env('TOURNAMENTS_TABLE'), ...retention });
const rounds = new RoundService({ store: new DynamoEventStore(dynamo, { tableName: env('EVENTS_TABLE'), ...retention }), clock, ids });
const accountRepository = new DynamoAccountRepository(dynamo, { tableName: env('ACCOUNTS_TABLE'), ...retention });
const registrations = new DynamoRegistrationRepository(dynamo, { tableName: env('TOURNAMENTS_TABLE'), ...retention });
const events = new EventService({ events: registry, accounts: accountRepository, registrations, clock, ids });
const reader = createRoundReader(rounds);

const api = createApi({
  tokens: new CognitoTokenVerifier(env('USER_POOL_ID'), env('USER_POOL_CLIENT_ID')),
  emails: new CognitoEmailLookup(new CognitoIdentityProviderClient({})),
  accounts: new AccountService({ accounts: accountRepository, clock, ids }),
  events,
  ingest: createIngest({ events, registry, rounds, clock, snapshots: new S3SnapshotStore(new S3Client({}), env('SNAPSHOTS_BUCKET')) }),
  board: createBoard({ registry, rounds: reader, clock }),
  rounds,
  reader,
  registrations: new RegistrationService({ registry, registrations, accounts: accountRepository, clock }),
  registry,
  clock,
  logError: (error) => { console.error(error); },
});

/** Entrada da Function URL (mesmo formato do API Gateway HTTP API, payload 2.0). */
export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> => {
  const body = event.body && event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf-8') : event.body ?? null;
  const response = await api({
    method: event.requestContext.http.method,
    // Pelo CloudFront a API chega em /api/...; direto pela Function URL, sem o prefixo.
    path: event.rawPath.replace(/^\/api(?=\/)/, ''),
    headers: event.headers,
    body,
  });
  return {
    statusCode: response.status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': response.cacheControl ?? 'no-store' },
    body: JSON.stringify(response.body),
  };
};
