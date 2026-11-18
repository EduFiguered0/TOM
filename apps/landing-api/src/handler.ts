import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { goodgame } from '@tom/landing-core';
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { randomUUID } from 'node:crypto';
import { createLandingApi } from './api.js';
import { CognitoGoogleVerifier, CognitoProfileLookup } from './identity.js';
import { DynamoLeadRepository } from './lead-repository.js';
import { LeadService } from './lead-service.js';

const env = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`Variável de ambiente ${name} ausente`);
  return value;
};

// Fora do handler: reaproveitado entre execuções da mesma instância.
const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}), { marshallOptions: { removeUndefinedValues: true } });
const clock = { now: () => new Date() };

const api = createLandingApi({
  verifier: new CognitoGoogleVerifier(env('USER_POOL_ID'), env('USER_POOL_CLIENT_ID')),
  profiles: new CognitoProfileLookup(new CognitoIdentityProviderClient({})),
  service: new LeadService({ repo: new DynamoLeadRepository(dynamo, { tableName: env('LEADS_TABLE') }), config: goodgame, clock, ids: { next: () => randomUUID() } }),
  config: goodgame,
  now: () => clock.now(),
  logError: (error) => { console.error(error); },
});

/** Entrada da Function URL (payload 2.0). Pelo CloudFront a API chega em /api/...; direto, sem o prefixo. */
export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> => {
  const body = event.body && event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf-8') : event.body ?? null;
  const response = await api({
    method: event.requestContext.http.method,
    path: event.rawPath.replace(/^\/api(?=\/)/, ''),
    headers: event.headers,
    query: event.queryStringParameters ?? {},
    body,
  });
  return {
    statusCode: response.status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': response.cacheControl ?? 'no-store' },
    body: JSON.stringify(response.body),
  };
};
