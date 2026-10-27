import {
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminInitiateAuthCommand,
  AdminSetUserPasswordCommand,
  CognitoIdentityProviderClient,
  ForgotPasswordCommand,
  InitiateAuthCommand,
  SignUpCommand,
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
const otherEmail = `teste-outro-${randomUUID()}@example.com`;
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

/** Um evento ativo por vez, e a tabela de teste guarda os de execuções anteriores: cancela o que sobrou. */
const cancelActive = async (adm: string) => {
  const active = await call('GET', '/events/active', adm);
  const event = active.body['event'] as { id: string } | null;
  if (event) expect((await call('POST', `/events/${event.id}/cancel`, adm)).status).toBe(200);
};

beforeAll(async () => {
  await Promise.all([createUser(email), createUser(adminEmail), createUser(otherEmail)]);
  await cognito.send(new AdminAddUserToGroupCommand({ UserPoolId: userPoolId, Username: adminEmail, GroupName: 'admin' }));
});

afterAll(async () => {
  await Promise.all([email, adminEmail, otherEmail].map((user) => cognito.send(new AdminDeleteUserCommand({ UserPoolId: userPoolId, Username: user }))));
});

describe('API real (TomApiTest)', () => {
  it('recusa chamada sem token ou com token forjado', async () => {
    expect((await call('GET', '/me', null)).status).toBe(401);
    expect((await call('GET', '/me', 'eyJhbGciOiJub25lIn0.e30.')).status).toBe(401);
  });

  it('cadastro com senha pelo próprio site: confirmado na hora, sem código, e "Esqueci minha senha" por e-mail', async () => {
    const self = `teste-senha-${randomUUID()}@example.com`;
    try {
      const signUp = await cognito.send(new SignUpCommand({
        ClientId: clientId, Username: self, Password: 'senha1234', UserAttributes: [{ Name: 'email', Value: self }],
      }));
      expect(signUp.UserConfirmed).toBe(true);
      const { AuthenticationResult } = await cognito.send(new InitiateAuthCommand({
        ClientId: clientId, AuthFlow: 'USER_AUTH', AuthParameters: { USERNAME: self, PASSWORD: 'senha1234', PREFERRED_CHALLENGE: 'PASSWORD' },
      }));
      const token = AuthenticationResult?.AccessToken ?? '';
      expect((await call('GET', '/me', token)).status).toBe(404);
      expect(await call('POST', '/me', token, { profile, playerId: null })).toMatchObject({ status: 201, body: { email: self } });
      // Único e-mail do sistema (conta para o limite diário do Cognito: um por execução).
      const forgot = await cognito.send(new ForgotPasswordCommand({ ClientId: clientId, Username: self }));
      expect(forgot.CodeDeliveryDetails?.DeliveryMedium).toBe('EMAIL');
    } finally {
      await cognito.send(new AdminDeleteUserCommand({ UserPoolId: userPoolId, Username: self }));
    }
  });

  it('cadastro, sessão única e troca de dispositivo de ponta a ponta', async () => {
    const phone1 = await login();
    expect((await call('GET', '/me', phone1)).status).toBe(404);

    const created = await call('POST', '/me', phone1, { profile, playerId: null, email: 'forjado@example.com' });
    expect(created).toMatchObject({ status: 201, body: { email, role: 'player', canAct: false } });
    expect((await call('GET', '/me', phone1)).status).toBe(200);

    const phone2 = await login();
    expect(await call('GET', '/me', phone2)).toMatchObject({ status: 401, body: { error: 'session_inactive' } });
    expect(await call('POST', '/session', phone2, { replace: false })).toMatchObject({ status: 409, body: { error: 'session_conflict' } });
    expect((await call('POST', '/session', phone2, { replace: true })).status).toBe(200);

    expect(await call('GET', '/me', phone1)).toMatchObject({ status: 401, body: { error: 'session_inactive' } });
    expect((await call('GET', '/me', phone2)).status).toBe(200);
  });

  it('Player ID vale na hora; em uso dá 409; o ADM desfaz o vínculo e o dono cadastra', async () => {
    // O jogador já foi cadastrado (sem Player ID) no teste anterior: entra por outro "celular" e confirma a troca.
    const [player, adm, other] = await Promise.all([login(), login(adminEmail), login(otherEmail)]);
    await call('POST', '/session', player, { replace: true });
    expect((await call('POST', '/me', adm, { profile, playerId: null })).body).toMatchObject({ role: 'admin' });
    // Player ID único por execução: as contas ficam na tabela, e a trava de unicidade é real.
    const playerId = String(Date.now());
    expect(await call('POST', '/me/player-id', player, { playerId })).toMatchObject({ status: 200, body: { playerId, canAct: true } });

    expect(await call('POST', '/me', other, { profile, playerId })).toMatchObject({ status: 409, body: { error: 'player_id_taken' } });
    expect((await call('POST', '/me', other, { profile, playerId: null })).status).toBe(201);
    expect((await call('GET', `/player-ids/${playerId}`, player)).status).toBe(403);
    expect(await call('GET', `/player-ids/${playerId}`, adm)).toMatchObject({ status: 200, body: { email, playerId } });
    expect(await call('POST', `/player-ids/${playerId}/unlink`, adm)).toMatchObject({ status: 200, body: { playerId: null } });
    expect(await call('GET', '/me', player)).toMatchObject({ status: 200, body: { canAct: false, playerId: null } });
    // A trava saiu de verdade no DynamoDB: o dono cadastra o mesmo Player ID.
    expect(await call('POST', '/me/player-id', other, { playerId })).toMatchObject({ status: 200, body: { playerId, canAct: true } });
  });

  it('equipe: ADM busca, marca juiz, escala no evento e desmarca', async () => {
    // O jogador ficou sem Player ID no teste anterior (vínculo desfeito): informa um novo, único por execução.
    const [player, adm] = await Promise.all([login(), login(adminEmail)]);
    await Promise.all([call('POST', '/session', player, { replace: true }), call('POST', '/session', adm, { replace: true })]);
    const playerId = `9${String(Date.now())}`;
    const me = await call('POST', '/me/player-id', player, { playerId });
    const id = String(me.body['id']);

    expect(await call('POST', '/staff/search', adm, { query: playerId })).toMatchObject({ status: 200, body: [{ id, playerId, judge: false }] });
    expect(await call('POST', `/staff/accounts/${id}/judge`, adm, { judge: true })).toMatchObject({ status: 200, body: { judge: true } });
    await cancelActive(adm);
    const created = await call('POST', '/events', adm, { label: 'Teste da equipe', judges: [id] });
    expect(created.status).toBe(201);
    await call('POST', `/events/${String(created.body['id'])}/cancel`, adm);
    expect((await call('GET', '/staff/judges', adm)).body).toEqual(expect.arrayContaining([expect.objectContaining({ id })]));
    expect((await call('POST', '/staff/search', player, { query: playerId })).status).toBe(403);
    expect(await call('POST', `/staff/accounts/${id}/judge`, adm, { judge: false })).toMatchObject({ status: 200, body: { judge: false } });
  });

  it('ingestão: ADM cria o evento, o enviador manda os HTMLs reais do TOM e a TV mostra a rodada', async () => {
    const adm = await login(adminEmail);
    await call('POST', '/session', adm, { replace: true });
    await cancelActive(adm);
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
    // Inscrições abertas: a TV mostra o QR (a rodada aparece quando o ADM inicia).
    expect(await call('GET', '/board', null)).toMatchObject({ status: 200, body: { state: 'open', code: (created.body['event'] as { code: string }).code } });
    // Versão nova do mesmo pareamento: guardada, mas a rodada não muda.
    expect(await send('pairings')).toMatchObject({ status: 200, body: { stored: true, published: [] } });

    await call('POST', `/events/${String(created.body['id'])}/revoke`, adm);
    expect((await send('standings')).status).toBe(401);
    await call('POST', `/events/${String(created.body['id'])}/cancel`, adm);
  });

  it('ADM envia pelo navegador para o evento ativo (sem token)', async () => {
    const [adm, player] = await Promise.all([login(adminEmail), login()]);
    await Promise.all([call('POST', '/session', adm, { replace: true }), call('POST', '/session', player, { replace: true })]);
    await cancelActive(adm);
    const created = await call('POST', '/events', adm, { label: 'Envio pelo navegador' });
    const fixtures = new URL('../../../packages/tom-reports/test/fixtures/fodase/', import.meta.url);
    const body = (report: string) => {
      const content = readFileSync(new URL(`FODASE${report}.html`, fixtures), 'utf8');
      return {
        tournament: 'FODASE', report, fileName: `FODASE${report}.html`, content,
        sha256: createHash('sha256').update(content).digest('hex'),
        // Versão nova a cada execução: o S3 de teste guarda as anteriores por 1 dia.
        modifiedAt: new Date().toISOString(),
      };
    };
    expect((await call('POST', '/events/active/uploads', player, body('pairings'))).status).toBe(403);
    expect((await call('POST', '/events/active/uploads', adm, body('pairings'))).status).toBe(200);
    expect(await call('POST', '/events/active/uploads', adm, body('match_slips'))).toMatchObject({ status: 200, body: { stored: true } });
    await call('POST', `/events/${String(created.body['id'])}/cancel`, adm);
    expect(await call('POST', '/events/active/uploads', adm, body('standings'))).toMatchObject({
      status: 409, body: { message: 'Crie o evento para começar a enviar' },
    });
  });

  it('ciclo do evento de ponta a ponta: QR inscreve, contadores, quadro e cancelamento', async () => {
    const [player, adm, other] = await Promise.all([login(), login(adminEmail), login(otherEmail)]);
    await Promise.all([player, adm, other].map((t) => call('POST', '/session', t, { replace: true })));
    await cancelActive(adm);
    const created = await call('POST', '/events', adm, { label: 'Ciclo automático', roundMinutes: 40 });
    expect(created).toMatchObject({ status: 201, body: { event: { status: 'open', roundMinutes: 40 } } });
    const { id, code } = created.body['event'] as { id: string; code: string };

    // A guarda de status de verdade no DynamoDB (QR fora do status esperado) é coberta pelo contrato do repositório.
    expect(await call('POST', `/join/${code}`, player)).toMatchObject({ status: 200, body: { registration: { awaitingApproval: false } } });
    expect((await call('POST', `/join/${code}`, player)).status).toBe(200);
    expect((await call('POST', `/join/${code}`, other)).status).toBe(200);
    expect(await call('GET', `/events/${id}/registrations`, adm)).toMatchObject({ status: 200, body: { total: 2, awaiting: 0, launched: 0 } });
    expect(await call('GET', '/board', null)).toMatchObject({ body: { state: 'open', registered: 2 } });
    expect(await call('POST', `/events/${id}/cancel`, adm)).toMatchObject({ status: 200, body: { status: 'cancelled' } });
    expect(await call('GET', '/board', null)).toMatchObject({ body: { state: 'idle' } });
  });
});
