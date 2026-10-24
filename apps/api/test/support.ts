/** Ambiente de teste da API: tudo em memória, tokens e e-mails do Cognito falsos. */
import {
  AccountService,
  EventService,
  InMemoryAccountRepository,
  InMemoryEventRegistry,
  InMemoryEventStore,
  InMemorySnapshotStore,
  RoundService,
  type Identity,
} from '@tom/core';
import { randomUUID } from 'node:crypto';
import { createBoard } from '../src/board.js';
import { createIngest } from '../src/ingest.js';
import { createApi, type HttpRequest } from '../src/index.js';

/** Token falso "login:sessão:grupo1,grupo2"; "expirado" é recusado. */
const tokens = {
  verify: (token: string): Promise<Identity> => {
    if (token === 'expirado') return Promise.reject(new Error('expirado'));
    const [login = '', session = '', groups = ''] = token.split(':');
    return Promise.resolve({ login, session, groups: groups ? groups.split(',') : [] });
  },
};

/** E-mail verificado de cada login no "Cognito"; os dois logins da Ana têm o mesmo e-mail. */
const EMAILS: Record<string, string> = { 'ana-email': 'ana@example.com', 'ana-google': 'Ana@Example.com', adm: 'adm@example.com' };

export const setup = () => {
  const errors: unknown[] = [];
  const clock = { now: () => new Date('2026-10-23T14:00:00Z') };
  const ids = { next: () => randomUUID() };
  const registry = new InMemoryEventRegistry();
  const rounds = new RoundService({ store: new InMemoryEventStore(), clock, ids });
  const events = new EventService({ events: registry, clock, ids });
  const accounts = new AccountService({ accounts: new InMemoryAccountRepository(), clock, ids });
  const api = createApi({
    tokens,
    emails: { verifiedEmail: (token) => Promise.resolve(EMAILS[token.split(':')[0] ?? ''] ?? 'sem-conta@example.com') },
    accounts,
    events,
    ingest: createIngest({ events, registry, rounds, clock, snapshots: new InMemorySnapshotStore() }),
    board: createBoard({ registry, rounds, clock }),
    logError: (e) => errors.push(e),
  });
  const call = (method: string, path: string, token: string | null, body?: unknown, headers: Record<string, string> = {}) =>
    api({
      method,
      path,
      headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
      body: body === undefined ? null : JSON.stringify(body),
    } satisfies HttpRequest);
  return { call, accounts, rounds, errors };
};

export const profile = { name: 'Ana Souza', birthYear: 1990, phone: null, guardianConsent: false };

/** Cadastra e devolve o id da conta. */
export const register = async (call: ReturnType<typeof setup>['call'], token: string, playerId: string | null = null) =>
  ((await call('POST', '/me', token, { profile, playerId })).body as { id: string }).id;
