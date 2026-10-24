import {
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminInitiateAuthCommand,
  AdminSetUserPasswordCommand,
  CognitoIdentityProviderClient,
} from '@aws-sdk/client-cognito-identity-provider';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
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
const adminEmail = `teste-adm-${randomUUID()}@example.com`;
const password = `Aa1!${randomUUID()}`;

/** Cada login gera um origin_jti novo: é como entrar por outro celular. */
const login = async (user = email): Promise<string> => {
  const { AuthenticationResult } = await cognito.send(new AdminInitiateAuthCommand({
    UserPoolId: userPoolId, ClientId: clientId, AuthFlow: 'ADMIN_USER_PASSWORD_AUTH',
    AuthParameters: { USERNAME: user, PASSWORD: password },
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

const createUser = async (user: string) => {
  await cognito.send(new AdminCreateUserCommand({
    UserPoolId: userPoolId, Username: user, MessageAction: 'SUPPRESS',
    UserAttributes: [{ Name: 'email', Value: user }, { Name: 'email_verified', Value: 'true' }],
  }));
  await cognito.send(new AdminSetUserPasswordCommand({ UserPoolId: userPoolId, Username: user, Password: password, Permanent: true }));
};

const profile = { name: 'Teste Automático', birthYear: 1990, phone: null, guardianConsent: false };

beforeAll(async () => {
  await Promise.all([createUser(email), createUser(adminEmail)]);
  await cognito.send(new AdminAddUserToGroupCommand({ UserPoolId: userPoolId, Username: adminEmail, GroupName: 'admin' }));
});

afterAll(async () => {
  await Promise.all([email, adminEmail].map((user) => cognito.send(new AdminDeleteUserCommand({ UserPoolId: userPoolId, Username: user }))));
});

describe('API real (TomApiTest)', () => {
  it('recusa chamada sem token ou com token forjado', async () => {
    expect((await call('GET', '/me', null)).status).toBe(401);
    expect((await call('GET', '/me', 'eyJhbGciOiJub25lIn0.e30.')).status).toBe(401);
  });

  it('cadastro, sessão única e troca de dispositivo de ponta a ponta', async () => {
    const phone1 = await login();
    expect((await call('GET', '/me', phone1)).status).toBe(404);

    const created = await call('POST', '/me', phone1, { profile, playerId: '100001', email: 'forjado@example.com' });
    expect(created).toMatchObject({ status: 201, body: { email, role: 'player', canAct: false } });
    expect((await call('GET', '/me', phone1)).status).toBe(200);

    const phone2 = await login();
    expect(await call('GET', '/me', phone2)).toMatchObject({ status: 401, body: { error: 'session_inactive' } });
    expect(await call('POST', '/session', phone2, { replace: false })).toMatchObject({ status: 409, body: { error: 'session_conflict' } });
    expect((await call('POST', '/session', phone2, { replace: true })).status).toBe(200);

    expect(await call('GET', '/me', phone1)).toMatchObject({ status: 401, body: { error: 'session_inactive' } });
    expect((await call('GET', '/me', phone2)).status).toBe(200);
  });

  it('check-in: o ADM confirma o Player ID e o jogador passa a agir', async () => {
    // O jogador já foi cadastrado no teste anterior: entra por outro "celular" e confirma a troca.
    const [player, adm] = await Promise.all([login(), login(adminEmail)]);
    const me = await call('POST', '/session', player, { replace: true });
    expect((await call('POST', '/me', adm, { profile, playerId: null })).body).toMatchObject({ role: 'admin' });
    const id = String(me.body['id']);

    expect((await call('GET', `/accounts/${id}`, player)).status).toBe(403);
    expect(await call('GET', `/accounts/${id}`, adm)).toMatchObject({ status: 200, body: { playerId: { value: '100001', confirmed: false } } });
    // Player ID único por execução: a trava de unicidade é real.
    const playerId = String(Date.now());
    expect(await call('POST', `/accounts/${id}/player-id`, adm, { playerId })).toMatchObject({
      status: 200, body: { playerId: { value: playerId, confirmed: true } },
    });
    expect(await call('GET', '/me', player)).toMatchObject({ status: 200, body: { canAct: true } });
  });

  it('ingestão: ADM cria o evento, o enviador manda os HTMLs reais do TOM e a TV mostra a rodada', async () => {
    const adm = await login(adminEmail);
    await call('POST', '/session', adm, { replace: true });
    const created = await call('POST', '/events', adm, { label: 'Teste automático' });
    expect(created.status).toBe(201);
    const token = String(created.body['token']);

    const fixtures = new URL('../../../packages/tom-reports/test/fixtures/fodase/', import.meta.url);
    const send = (report: string) => {
      const content = readFileSync(new URL(`FODASE${report}.html`, fixtures), 'utf8');
      return fetch(new URL('/uploads', apiUrl), {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-upload-token': token },
        body: JSON.stringify({
          tournament: 'FODASE', report, fileName: `FODASE${report}.html`, content,
          sha256: createHash('sha256').update(content).digest('hex'),
          // Versão nova a cada execução: o S3 de teste guarda as anteriores por 1 dia.
          modifiedAt: new Date().toISOString(),
        }),
      }).then(async (r) => ({ status: r.status, body: (await r.json()) as Record<string, unknown> }));
    };

    expect((await send('pairings')).status).toBe(200);
    const slips = await send('match_slips');
    expect(slips.status).toBe(200);
    expect(await call('GET', '/board', null)).toMatchObject({ status: 200, body: { tournament: 'FODASE' } });
    // Versão nova do mesmo pareamento: guardada, mas a rodada não muda.
    expect(await send('pairings')).toMatchObject({ status: 200, body: { stored: true, published: [] } });

    await call('POST', `/events/${String(created.body['id'])}/revoke`, adm);
    expect((await send('standings')).status).toBe(401);
  });
});
