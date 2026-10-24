import {
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminInitiateAuthCommand,
  AdminSetUserPasswordCommand,
  CognitoIdentityProviderClient,
} from '@aws-sdk/client-cognito-identity-provider';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { awsConfig, stackOutput } from '../../../packages/aws-adapters/test/aws-env.js';

/** Ponta a ponta contra TomApiTest: usuário descartável no pool de testes, dois "celulares", apagado no fim. */
const cognito = new CognitoIdentityProviderClient(awsConfig);
const [apiUrl, userPoolId, clientId] = await Promise.all([
  stackOutput('TomApiTest', 'ApiUrl'),
  stackOutput('TomAuthTest', 'UserPoolId'),
  stackOutput('TomAuthTest', 'UserPoolClientId'),
]);
const email = `teste-${randomUUID()}@example.com`;
const password = `Aa1!${randomUUID()}`;

/** Cada login gera um origin_jti novo: é como entrar por outro celular. */
const login = async (): Promise<string> => {
  const { AuthenticationResult } = await cognito.send(new AdminInitiateAuthCommand({
    UserPoolId: userPoolId, ClientId: clientId, AuthFlow: 'ADMIN_USER_PASSWORD_AUTH',
    AuthParameters: { USERNAME: email, PASSWORD: password },
  }));
  if (!AuthenticationResult?.AccessToken) throw new Error('Login sem token');
  return AuthenticationResult.AccessToken;
};

const call = async (method: string, path: string, token: string | null, body?: unknown) => {
  const response = await fetch(new URL(path, apiUrl), {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
};

beforeAll(async () => {
  await cognito.send(new AdminCreateUserCommand({
    UserPoolId: userPoolId, Username: email, MessageAction: 'SUPPRESS',
    UserAttributes: [{ Name: 'email', Value: email }, { Name: 'email_verified', Value: 'true' }],
  }));
  await cognito.send(new AdminSetUserPasswordCommand({ UserPoolId: userPoolId, Username: email, Password: password, Permanent: true }));
});

afterAll(async () => {
  await cognito.send(new AdminDeleteUserCommand({ UserPoolId: userPoolId, Username: email }));
});

describe('API real (TomApiTest)', () => {
  it('recusa chamada sem token ou com token forjado', async () => {
    expect((await call('GET', '/me', null)).status).toBe(401);
    expect((await call('GET', '/me', 'eyJhbGciOiJub25lIn0.e30.')).status).toBe(401);
  });

  it('cadastro, sessão única e troca de dispositivo de ponta a ponta', async () => {
    const phone1 = await login();
    expect((await call('GET', '/me', phone1)).status).toBe(404);

    const created = await call('POST', '/me', phone1, {
      profile: { name: 'Teste Automático', birthYear: 1990, phone: null, guardianConsent: false },
      playerId: '100001',
      email: 'forjado@example.com',
    });
    expect(created).toMatchObject({ status: 201, body: { email, role: 'player', canAct: false } });
    expect((await call('GET', '/me', phone1)).status).toBe(200);

    const phone2 = await login();
    expect(await call('GET', '/me', phone2)).toMatchObject({ status: 401, body: { error: 'session_inactive' } });
    expect(await call('POST', '/session', phone2, { replace: false })).toMatchObject({ status: 409, body: { error: 'session_conflict' } });
    expect((await call('POST', '/session', phone2, { replace: true })).status).toBe(200);

    expect(await call('GET', '/me', phone1)).toMatchObject({ status: 401, body: { error: 'session_inactive' } });
    expect((await call('GET', '/me', phone2)).status).toBe(200);
  });
});
