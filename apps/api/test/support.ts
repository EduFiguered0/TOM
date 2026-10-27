/** Ambiente de teste da API: tudo em memória, tokens e e-mails do Cognito falsos. */
import {
  AccountService,
  EventService,
  InMemoryAccountRepository,
  InMemoryEventRegistry,
  InMemoryEventStore,
  InMemoryJudgeInviteRepository,
  InMemoryRegistrationRepository,
  InMemorySnapshotStore,
  JudgeInviteService,
  RegistrationService,
  RoundService,
  type Identity,
} from '@tom/core';
import type { CreateEventResponse, MyRoundResponse, UploadResponse } from '@tom/contracts';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createBoard } from '../src/board.js';
import { createIngest } from '../src/ingest.js';
import { createRoundReader } from '../src/rounds.js';
import { createApi, type HttpRequest } from '../src/index.js';

/** Token falso "login:sessão:grupo1,grupo2"; "expirado" é recusado. */
const tokens = {
  verify: (token: string): Promise<Identity> => {
    if (token === 'expirado') return Promise.reject(new Error('expirado'));
    const [login = '', session = '', groups = ''] = token.split(':');
    return Promise.resolve({ login, session, groups: groups ? groups.split(',') : [], provider: login.includes('google') ? 'google' : 'password' });
  },
};

/** E-mail verificado de cada login no "Cognito"; os dois logins da Ana têm o mesmo e-mail. */
const EMAILS: Record<string, string> = { 'ana-email': 'ana@example.com', 'ana-google': 'Ana@Example.com', 'ana-senha': 'ana@example.com', adm: 'adm@example.com' };

export const setup = () => {
  const errors: unknown[] = [];
  const clock = { now: () => new Date('2026-10-23T14:00:00Z') };
  const ids = { next: () => randomUUID() };
  const registry = new InMemoryEventRegistry();
  const rounds = new RoundService({ store: new InMemoryEventStore(), clock, ids });
  const accountRepository = new InMemoryAccountRepository();
  const registrations = new InMemoryRegistrationRepository(registry);
  const events = new EventService({ events: registry, accounts: accountRepository, registrations, clock, ids });
  const accounts = new AccountService({ accounts: accountRepository, clock, ids });
  const reader = createRoundReader(rounds);
  const api = createApi({
    tokens,
    emails: { verifiedEmail: (token) => Promise.resolve(EMAILS[token.split(':')[0] ?? ''] ?? `${token.split(':')[0] ?? ''}@example.com`) },
    accounts,
    events,
    ingest: createIngest({ events, registry, rounds, clock, snapshots: new InMemorySnapshotStore() }),
    board: createBoard({ registry, rounds: reader, registrations, clock }),
    rounds,
    reader,
    registry,
    registrations: new RegistrationService({ registry, registrations, accounts: accountRepository, clock }),
    invites: new JudgeInviteService({ invites: new InMemoryJudgeInviteRepository(), accounts, clock }),
    clock,
    logError: (e) => errors.push(e),
  });
  const call = (method: string, path: string, token: string | null, body?: unknown, headers: Record<string, string> = {}) =>
    api({
      method,
      path,
      headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
      body: body === undefined ? null : JSON.stringify(body),
    } satisfies HttpRequest);
  return { call, accounts, accountRepository, rounds, errors };
};

export const profile = { firstName: 'Ana', lastName: 'Souza', birthYear: 1990, phone: null, guardianConsent: false };

/** Cadastra e devolve o id da conta. */
export const register = async (call: ReturnType<typeof setup>['call'], token: string, playerId: string | null = null) =>
  ((await call('POST', '/me', token, { profile, playerId })).body as { id: string }).id;

/** HTMLs reais gerados pelo TOM 1.86 no torneio de teste "FODASE". */
const FIXTURES = new URL('../../../packages/tom-reports/test/fixtures/fodase/', import.meta.url);

export const upload = (report: string, content = readFileSync(new URL(`FODASE${report}.html`, FIXTURES), 'utf8'), modifiedAt = '2026-10-24T14:00:00Z') => ({
  tournament: 'FODASE',
  report,
  fileName: `FODASE${report}.html`,
  content,
  sha256: createHash('sha256').update(content).digest('hex'),
  modifiedAt,
});

/** ADM cadastrado que cria um evento e devolve o token do enviador. */
export const withEvent = async () => {
  const ctx = setup();
  await register(ctx.call, 'adm:a1');
  const created = await ctx.call('POST', '/events', 'adm:a1:admin', { label: 'Liga de Outubro' });
  const { token } = created.body as CreateEventResponse;
  const send = async (body: ReturnType<typeof upload>, uploadToken = token) => {
    const response = await ctx.call('POST', '/uploads', null, body, { 'x-upload-token': uploadToken });
    return { status: response.status, body: response.body as UploadResponse & { error?: string } };
  };
  return { ...ctx, token, eventId: (created.body as CreateEventResponse).id, send };
};

/** Juiz da equipe escalado no evento de `withEvent`: cadastra, o ADM marca e escala. Devolve o id da conta. */
export const addJudge = async (ctx: Awaited<ReturnType<typeof withEvent>>, token: string, playerId: string) => {
  const id = await register(ctx.call, token, playerId);
  await ctx.call('POST', `/staff/accounts/${id}/judge`, 'adm:a1:admin', { judge: true });
  await ctx.call('PUT', `/events/${ctx.eventId}/judges`, 'adm:a1:admin', { judges: [id] });
  return id;
};

/** Mesa 1 do FODASE, rodada 3: 100001 "teste2 2" x 100002 "teste5 5". */
export const setupRound = async () => {
  const ctx = await withEvent();
  await ctx.send(upload('pairings'));
  await ctx.send(upload('match_slips'));
  await register(ctx.call, 'p1:c1', '100001');
  await register(ctx.call, 'p2:c2', '100002');
  const me = async (token: string) => (await ctx.call('GET', '/round/me', token)).body as MyRoundResponse;
  const report = (token: string, report: unknown) => ctx.call('POST', '/round/report', token, { report });
  const start = () => ctx.call('POST', '/round/start', 'adm:a1:admin', { bestOf: 3, roundMinutes: null });
  return { ...ctx, me, report, start };
};
