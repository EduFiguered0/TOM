import {
  InvalidRequestError,
  parseCreateEventRequest,
  parseExtendRequest,
  parseOverrideRequest,
  parsePlayerIdRequest,
  parseStaffReportRequest,
  parseRegisterRequest,
  parseReportRequest,
  parseStartRoundRequest,
  parseSessionRequest,
  parseUploadRequest,
  type AccountResponse,
  type BoardResponse,
  type CreateEventResponse,
  type ErrorResponse,
  type MeResponse,
} from '@tom/contracts';
import {
  CommandRejected,
  type Account,
  type AccountService,
  type EventRegistry,
  type EventService,
  type Identity,
  type Principal,
  type RejectCode,
  type RoundService,
} from '@tom/core';
import type { Ingest } from './ingest.js';
import { panel } from './panel.js';
import { myRound, type RoundReader } from './rounds.js';

export interface HttpRequest {
  method: string;
  path: string;
  /** Nomes em minúsculas. */
  headers: Readonly<Record<string, string | undefined>>;
  body: string | null;
}

export interface HttpResponse {
  status: number;
  body: unknown;
  /** Padrão: no-store. Respostas públicas podem ficar alguns segundos no cache do CloudFront. */
  cacheControl?: string;
}

/** Valida o token de acesso do Cognito; lança se for inválido ou expirado. */
export interface TokenVerifier {
  verify(accessToken: string): Promise<Identity>;
}

/** E-mail verificado do dono do token, consultado no Cognito. */
export interface EmailLookup {
  verifiedEmail(accessToken: string): Promise<string>;
}

export interface ApiDeps {
  tokens: TokenVerifier;
  emails: EmailLookup;
  accounts: AccountService;
  events: EventService;
  ingest: Ingest;
  board: () => Promise<BoardResponse | null>;
  rounds: RoundService;
  reader: RoundReader;
  registry: EventRegistry;
  clock: { now(): Date };
  logError: (error: unknown) => void;
}

const STATUS: Record<RejectCode, number> = {
  forbidden: 403,
  invalid_input: 400,
  account_not_found: 404,
  table_not_found: 404,
  not_your_table: 403,
  session_inactive: 401,
  account_exists: 409,
  session_conflict: 409,
  player_id_taken: 409,
  player_id_set: 409,
  concurrency: 409,
  round_not_paired: 409,
  round_already_started: 409,
  round_not_started: 409,
  previous_round_open: 409,
  side_required: 400,
  table_locked: 409,
  not_green: 409,
  key_already_launched: 409,
  invalid_token: 401,
  tournament_mismatch: 409,
  event_not_found: 404,
};

class Unauthorized extends Error {}

const error = (status: number, code: string, message: string): HttpResponse => ({
  status,
  body: { error: code, message } satisfies ErrorResponse,
});

const toAccount = (account: Account): AccountResponse => ({
  id: account.id,
  email: account.email,
  profile: account.profile,
  playerId: account.playerId,
  createdAt: account.createdAt.toISOString(),
});

const toMe = ({ account, actor }: Principal): MeResponse => ({
  ...toAccount(account),
  role: actor?.role === 'admin' || actor?.role === 'judge' ? actor.role : 'player',
  canAct: actor !== null,
});

const jsonBody = (request: HttpRequest): unknown => {
  try {
    return JSON.parse(request.body ?? '');
  } catch {
    throw new InvalidRequestError('Corpo deve ser JSON');
  }
};

const bearer = (request: HttpRequest): string => {
  const match = /^Bearer (\S+)$/.exec(request.headers['authorization'] ?? '');
  if (!match?.[1]) throw new Unauthorized();
  return match[1];
};

interface Context {
  request: HttpRequest;
  token: string;
  identity: Identity;
  /** Parâmetros do caminho, na ordem dos grupos da expressão. */
  params: string[];
}

interface Route {
  method: string;
  path: RegExp;
  handle: (ctx: Context) => Promise<HttpResponse>;
}

/** Rotas que não usam o login do Cognito: o enviador (token do evento) e a TV (pública). */
interface OpenRoute {
  method: string;
  path: RegExp;
  handle: (request: HttpRequest) => Promise<HttpResponse>;
}

/** Identificador de evento no caminho (UUID). */
const EVENT_ID = '([0-9a-f-]{36})';
/** Player ID no caminho: só dígitos. */
const PLAYER_ID = '([0-9]{1,20})';

/** Roteador da API: uma Lambda atende todas as rotas. Todas exigem token de acesso válido. */
export const createApi = ({ tokens, emails, accounts, events, ingest, board, rounds, reader, registry, clock, logError }: ApiDeps) => {
  /**
   * Primeiro acesso por um login novo (ex.: Google de quem já tinha conta pelo código por e-mail):
   * liga o login à conta do mesmo e-mail verificado e repete. Sem conta com esse e-mail, segue o 404.
   */
  const linkingNewLogin = async <T>(token: string, identity: Identity, run: () => Promise<T>): Promise<T> => {
    try {
      return await run();
    } catch (e) {
      if (!(e instanceof CommandRejected) || e.code !== 'account_not_found') throw e;
      await accounts.linkLogin(identity, await emails.verifiedEmail(token));
      return run();
    }
  };

  const routes: Route[] = [
    {
      method: 'GET', path: /^\/me$/,
      handle: async ({ token, identity }) => ({
        status: 200,
        body: toMe(await linkingNewLogin(token, identity, () => accounts.authenticate(identity))),
      }),
    },
    {
      method: 'POST', path: /^\/me$/,
      handle: async ({ request, token, identity }) => {
        const input = parseRegisterRequest(jsonBody(request));
        await accounts.register(identity, await emails.verifiedEmail(token), input);
        return { status: 201, body: toMe(await accounts.authenticate(identity)) };
      },
    },
    {
      method: 'POST', path: /^\/session$/,
      handle: async ({ request, token, identity }) => {
        const { replace } = parseSessionRequest(jsonBody(request));
        await linkingNewLogin(token, identity, () => accounts.activateSession(identity, replace));
        return { status: 200, body: toMe(await accounts.authenticate(identity)) };
      },
    },
    {
      method: 'POST', path: /^\/me\/player-id$/,
      handle: async ({ request, identity }) => {
        const { playerId } = parsePlayerIdRequest(jsonBody(request));
        await accounts.authenticate(identity);
        await accounts.claimPlayerId(identity, playerId);
        return { status: 200, body: toMe(await accounts.authenticate(identity)) };
      },
    },
  ];

  const adminRoutes: Route[] = [
    {
      method: 'GET', path: new RegExp(`^/player-ids/${PLAYER_ID}$`),
      handle: async ({ identity, params: [pid = ''] }) => {
        const { actor } = await accounts.authenticate(identity);
        return { status: 200, body: toAccount(await accounts.findByPlayerId(actor, pid)) };
      },
    },
    {
      method: 'POST', path: new RegExp(`^/player-ids/${PLAYER_ID}/unlink$`),
      handle: async ({ identity, params: [pid = ''] }) => {
        const { actor } = await accounts.authenticate(identity);
        return { status: 200, body: toAccount(await accounts.unlinkPlayerId(actor, pid)) };
      },
    },
    {
      method: 'POST', path: /^\/events$/,
      handle: async ({ request, identity }) => {
        const { label } = parseCreateEventRequest(jsonBody(request));
        const { actor } = await accounts.authenticate(identity);
        const { event, token } = await events.createEvent(actor, label);
        return { status: 201, body: { id: event.id, label: event.label, token } satisfies CreateEventResponse };
      },
    },
    {
      method: 'POST', path: new RegExp(`^/events/${EVENT_ID}/revoke$`),
      handle: async ({ identity, params: [id = ''] }) => {
        const { actor } = await accounts.authenticate(identity);
        const event = await events.revoke(actor, id);
        return { status: 200, body: { id: event.id, label: event.label, revoked: event.revoked } };
      },
    },
  ];
  routes.push(...adminRoutes);

  const currentRef = async () => {
    const current = await registry.current();
    if (!current) throw new CommandRejected('round_not_paired', 'Nenhuma rodada publicada pelo TOM ainda');
    return current.ref;
  };

  const roundRoutes: Route[] = [
    {
      method: 'GET', path: /^\/round\/me$/,
      handle: async ({ identity }) => {
        const { actor } = await accounts.authenticate(identity);
        const current = await registry.current();
        const state = current ? await reader.state(current.ref) : null;
        return { status: 200, body: myRound(state, actor, clock.now()) };
      },
    },
    {
      method: 'POST', path: /^\/round\/report$/,
      handle: async ({ request, identity }) => {
        const { report } = parseReportRequest(jsonBody(request));
        const { actor } = await accounts.authenticate(identity);
        if (actor?.role !== 'player') throw new CommandRejected('forbidden', 'Só jogador com check-in feito reporta pela própria mesa');
        const ref = await currentRef();
        // A mesa do jogador não muda depois do pareamento: dá para usar o cache; o reporte em si relê o estado.
        const table = (await reader.state(ref)).tables.find((t) => t.player1.playerId === actor.playerId || t.player2.playerId === actor.playerId);
        if (!table) throw new CommandRejected('not_your_table', 'Você não está em nenhuma mesa desta rodada');
        const state = reader.remember(await rounds.submitReport(actor, ref, { table: table.table, report }));
        return { status: 200, body: myRound(state, actor, clock.now()) };
      },
    },
    {
      method: 'POST', path: /^\/round\/start$/,
      handle: async ({ request, identity }) => {
        const { bestOf, roundMinutes } = parseStartRoundRequest(jsonBody(request));
        const { actor } = await accounts.authenticate(identity);
        if (actor?.role !== 'admin') throw new CommandRejected('forbidden', 'Só o ADM inicia a rodada');
        reader.remember(await rounds.startRound(actor, await currentRef(), { bestOf, ...(roundMinutes === null ? {} : { roundMinutes }) }));
        return { status: 200, body: await board() };
      },
    },
  ];
  routes.push(...roundRoutes);

  /** Painel: juiz e ADM; cada comando aplica as regras do RoundService (papel, mesa travada, key lançada...). */
  const staff = async (identity: Identity) => {
    const { actor } = await accounts.authenticate(identity);
    if (actor?.role !== 'judge' && actor?.role !== 'admin') throw new CommandRejected('forbidden', 'Só juiz e ADM usam o painel');
    return actor;
  };
  const respond = (state: Awaited<ReturnType<RoundService['state']>>, extra: Record<string, unknown> = {}): HttpResponse =>
    ({ status: 200, body: { ...panel(reader.remember(state), clock.now()), ...extra } });

  const panelRoutes: Route[] = [
    {
      method: 'GET', path: /^\/panel$/,
      handle: async ({ identity }) => {
        await staff(identity);
        const current = await registry.current();
        return { status: 200, body: panel(current ? await reader.state(current.ref) : null, clock.now()) };
      },
    },
    {
      method: 'POST', path: /^\/panel\/tables\/(\d+)\/override$/,
      handle: async ({ request, identity, params: [table = ''] }) => {
        const { override, reason } = parseOverrideRequest(jsonBody(request));
        const actor = await staff(identity);
        const result = await rounds.applyOverride(actor, await currentRef(), { table: Number(table), override, reason });
        return respond(result.state, { requiresTomFix: result.requiresTomFix });
      },
    },
    {
      method: 'POST', path: /^\/panel\/tables\/(\d+)\/extend$/,
      handle: async ({ request, identity, params: [table = ''] }) => {
        const { minutes } = parseExtendRequest(jsonBody(request));
        const actor = await staff(identity);
        return respond(await rounds.extendTime(actor, await currentRef(), { table: Number(table), minutes }));
      },
    },
    {
      method: 'POST', path: /^\/panel\/tables\/(\d+)\/key-launched$/,
      handle: async ({ identity, params: [table = ''] }) => {
        const actor = await staff(identity);
        return respond(await rounds.markKeyLaunched(actor, await currentRef(), { table: Number(table) }));
      },
    },
    {
      method: 'POST', path: /^\/panel\/tables\/(\d+)\/report$/,
      handle: async ({ request, identity, params: [table = ''] }) => {
        const { side, report } = parseStaffReportRequest(jsonBody(request));
        const actor = await staff(identity);
        return respond(await rounds.submitReport(actor, await currentRef(), { table: Number(table), report, side }));
      },
    },
  ];
  routes.push(...panelRoutes);

  const openRoutes: OpenRoute[] = [
    {
      method: 'POST', path: /^\/uploads$/,
      handle: async (request) => ({
        status: 200,
        body: await ingest(request.headers['x-upload-token'] ?? '', parseUploadRequest(jsonBody(request))),
      }),
    },
    {
      method: 'GET', path: /^\/board$/,
      handle: async () => {
        const current = await board();
        // Muitas TVs e celulares olhando custam o mesmo que um: o CloudFront guarda por 5 s.
        return current
          ? { status: 200, body: current, cacheControl: 'public, max-age=5' }
          : { ...error(404, 'no_round', 'Nenhuma rodada publicada ainda'), cacheControl: 'public, max-age=5' };
      },
    },
  ];

  const match = (request: HttpRequest) => {
    for (const route of routes) {
      const found = route.method === request.method ? route.path.exec(request.path) : null;
      if (found) return { route, params: found.slice(1) };
    }
    return null;
  };

  const fail = (e: unknown): HttpResponse => {
    if (e instanceof Unauthorized) return error(401, 'unauthorized', 'Token ausente, inválido ou expirado');
    if (e instanceof InvalidRequestError) return error(400, 'invalid_input', e.message);
    if (e instanceof CommandRejected) return error(STATUS[e.code], e.code, e.message);
    logError(e);
    return error(500, 'internal', 'Erro interno; tente de novo');
  };

  return async (request: HttpRequest): Promise<HttpResponse> => {
    const open = openRoutes.find((r) => r.method === request.method && r.path.test(request.path));
    if (open) return open.handle(request).catch(fail);
    const found = match(request);
    if (!found) return error(404, 'not_found', 'Rota não encontrada');
    try {
      const token = bearer(request);
      const identity = await tokens.verify(token).catch(() => {
        throw new Unauthorized();
      });
      return await found.route.handle({ request, token, identity, params: found.params });
    } catch (e) {
      return fail(e);
    }
  };
};
