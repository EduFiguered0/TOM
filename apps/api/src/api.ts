import {
  InvalidRequestError,
  parseAddRegistrationRequest,
  parseCreateEventRequest,
  parseSetLaunchedRequest,
  parseUpdateEventRequest,
  parseJudgesRequest,
  parseSearchRequest,
  parseSetJudgeRequest,
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
  type ActiveEventResponse,
  type EventDto,
  type JoinResponse,
  type MyEventResponse,
  type RegistrationDto,
  type RegistrationsResponse,
  type BoardResponse,
  type UploadResponse,
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
  type Registration,
  type RegistrationService,
  type RejectCode,
  type RoundRef,
  type RoundService,
  type TournamentEvent,
  staffActor,
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
  board: () => Promise<BoardResponse>;
  rounds: RoundService;
  reader: RoundReader;
  registry: EventRegistry;
  registrations: RegistrationService;
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
  side_required: 400,
  table_locked: 409,
  not_green: 409,
  key_already_launched: 409,
  invalid_token: 401,
  tournament_mismatch: 409,
  event_not_found: 404,
  event_active: 409,
  event_state: 409,
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
  judge: account.judge === true,
  createdAt: account.createdAt.toISOString(),
});

const toMe = ({ account, actor }: Principal, judging: boolean): MeResponse => ({
  ...toAccount(account),
  role: actor?.role === 'admin' ? 'admin' : 'player',
  canAct: actor !== null,
  judge: account.judge === true,
  judging,
});

/** `withCode`: só o ADM recebe o código do QR (a TV mostra no QR; o resto não precisa). */
const toEvent = (event: TournamentEvent, withCode = false): EventDto => ({
  id: event.id,
  label: event.label,
  date: event.date,
  roundMinutes: event.roundMinutes,
  status: event.status,
  judges: event.judges,
  ...(withCode && event.code ? { code: event.code } : {}),
});

const toRegistration = (r: Registration, inRound: boolean | null): RegistrationDto => ({
  accountId: r.accountId,
  playerId: r.playerId,
  name: r.name,
  birthYear: r.birthYear,
  at: r.at.toISOString(),
  by: r.by,
  confirmed: r.confirmed,
  launched: r.launched,
  removed: r.removed,
  inRound,
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
/** Identificador de conta no caminho (UUID). */
const ACCOUNT_ID = EVENT_ID;
/** Código do QR no caminho: 8 letras maiúsculas e dígitos. */
const EVENT_CODE = '([A-Z0-9]{8})';
/** Player ID no caminho: só dígitos. */
const PLAYER_ID = '([0-9]{1,20})';

/** Roteador da API: uma Lambda atende todas as rotas. Todas exigem token de acesso válido. */
export const createApi = ({ tokens, emails, accounts, events, ingest, board, rounds, reader, registry, registrations, clock, logError }: ApiDeps) => {
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

  /** Evento atual (painel, juiz, reporte): o evento ativo. */
  const currentEvent = () => events.active();

  const requireAdmin = async (identity: Identity) => {
    const { actor } = await accounts.authenticate(identity);
    if (actor?.role !== 'admin') throw new CommandRejected('forbidden', 'Só o ADM pode executar esta ação');
    return actor;
  };

  /** Player IDs nas guias da rodada atual do evento; null antes de o TOM publicar uma rodada dele. */
  const roundPlayers = async (event: TournamentEvent): Promise<Set<string> | null> => {
    const current = await registry.current();
    if (current?.eventId !== event.id) return null;
    return new Set((await reader.state(current.ref)).tables.flatMap((t) => [t.player1.playerId, t.player2.playerId]));
  };
  const registrationOf = async (r: Registration, event: TournamentEvent) => {
    const players = await roundPlayers(event);
    return toRegistration(r, players ? players.has(r.playerId) : null);
  };
  const eventById = async (id: string) => {
    const record = await registry.get(id);
    if (!record) throw new CommandRejected('event_not_found', 'Evento não encontrado');
    return record.event;
  };
  const isJudging = async (principal: Principal) => staffActor(principal, await currentEvent())?.role === 'judge';
  const me = async (principal: Principal) => toMe(principal, await isJudging(principal));

  const routes: Route[] = [
    {
      method: 'GET', path: /^\/me$/,
      handle: async ({ token, identity }) => ({
        status: 200,
        body: await me(await linkingNewLogin(token, identity, () => accounts.authenticate(identity))),
      }),
    },
    {
      method: 'POST', path: /^\/me$/,
      handle: async ({ request, token, identity }) => {
        const input = parseRegisterRequest(jsonBody(request));
        await accounts.register(identity, await emails.verifiedEmail(token), input);
        return { status: 201, body: await me(await accounts.authenticate(identity)) };
      },
    },
    {
      method: 'POST', path: /^\/session$/,
      handle: async ({ request, token, identity }) => {
        const { replace } = parseSessionRequest(jsonBody(request));
        await linkingNewLogin(token, identity, () => accounts.activateSession(identity, replace));
        return { status: 200, body: await me(await accounts.authenticate(identity)) };
      },
    },
    {
      method: 'POST', path: new RegExp(`^/join/${EVENT_CODE}$`),
      handle: async ({ identity, params: [code = ''] }) => {
        const principal = await accounts.authenticate(identity);
        const { event, registration } = await registrations.join(principal, code);
        return { status: 200, body: { event: toEvent(event), registration: await registrationOf(registration, event) } satisfies JoinResponse };
      },
    },
    {
      method: 'GET', path: /^\/me\/event$/,
      handle: async ({ identity }) => {
        const mine = await registrations.mine(await accounts.authenticate(identity));
        const body: MyEventResponse = {
          event: mine ? toEvent(mine.event) : null,
          registration: mine?.registration ? await registrationOf(mine.registration, mine.event) : null,
        };
        return { status: 200, body };
      },
    },
    {
      method: 'POST', path: /^\/me\/event\/confirm$/,
      handle: async ({ identity }) => {
        const principal = await accounts.authenticate(identity);
        const active = await events.active();
        if (!active) throw new CommandRejected('event_not_found', 'Evento não encontrado');
        return { status: 200, body: await registrationOf(await registrations.confirm(principal, active.id), active) };
      },
    },
    {
      method: 'POST', path: /^\/me\/player-id$/,
      handle: async ({ request, identity }) => {
        const { playerId } = parsePlayerIdRequest(jsonBody(request));
        await accounts.authenticate(identity);
        await accounts.claimPlayerId(identity, playerId);
        return { status: 200, body: await me(await accounts.authenticate(identity)) };
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
        const account = await accounts.unlinkPlayerId(actor, pid);
        // A conta errada sai também do evento ativo.
        const active = await events.active();
        if (active) await registrations.dropAccount(active.id, account.id);
        return { status: 200, body: toAccount(account) };
      },
    },
    {
      method: 'POST', path: /^\/events$/,
      handle: async ({ request, identity }) => {
        const input = parseCreateEventRequest(jsonBody(request));
        const { actor } = await accounts.authenticate(identity);
        const { event, token } = await events.createEvent(actor, input);
        return { status: 201, body: { id: event.id, label: event.label, token, event: toEvent(event, true) } satisfies CreateEventResponse };
      },
    },
    {
      method: 'POST', path: /^\/events\/active\/uploads$/,
      handle: async ({ request, identity }) => {
        const upload = parseUploadRequest(jsonBody(request));
        const actor = await requireAdmin(identity);
        const event = await events.authorizeAdminUpload(actor, upload.tournament, new Date(upload.modifiedAt));
        if (!event) return { status: 200, body: { stored: false, published: [], note: 'Arquivo de antes do evento: ignorado' } satisfies UploadResponse };
        const author = { role: 'system', source: `navegador:${actor.accountId}` } as const;
        return { status: 200, body: await ingest.forEvent(event, upload, author) };
      },
    },
    {
      method: 'GET', path: /^\/events\/active$/,
      handle: async ({ identity }) => {
        await requireAdmin(identity);
        const event = await events.active();
        return { status: 200, body: { event: event ? toEvent(event, true) : null } satisfies ActiveEventResponse };
      },
    },
    {
      method: 'PATCH', path: new RegExp(`^/events/${EVENT_ID}$`),
      handle: async ({ request, identity, params: [id = ''] }) => {
        const change = parseUpdateEventRequest(jsonBody(request));
        const { actor } = await accounts.authenticate(identity);
        return { status: 200, body: toEvent(await events.update(actor, id, change), true) };
      },
    },
    ...([
      ['confirmation', (actor, id) => events.requestConfirmation(actor, id)],
      ['close', (actor, id) => events.close(actor, id)],
      ['cancel', (actor, id) => events.cancel(actor, id)],
    ] as const satisfies readonly (readonly [string, (actor: Principal['actor'], id: string) => Promise<TournamentEvent>])[]).map(([action, run]): Route => ({
      method: 'POST', path: new RegExp(`^/events/${EVENT_ID}/${action}$`),
      handle: async ({ identity, params: [id = ''] }) => {
        const { actor } = await accounts.authenticate(identity);
        return { status: 200, body: toEvent(await run(actor, id), true) };
      },
    })),
    {
      method: 'GET', path: new RegExp(`^/events/${EVENT_ID}/registrations$`),
      handle: async ({ identity, params: [id = ''] }) => {
        const actor = await requireAdmin(identity);
        const event = await eventById(id);
        const players = await roundPlayers(event);
        const list = await registrations.list(actor, id);
        const kept = list.filter((r) => !r.removed);
        const body: RegistrationsResponse = {
          // Removidos no fim: a lista que interessa é a de quem vai jogar.
          registrations: [...kept, ...list.filter((r) => r.removed)].map((r) => toRegistration(r, players ? players.has(r.playerId) : null)),
          total: kept.length,
          confirmed: kept.filter((r) => r.confirmed).length,
          launched: kept.filter((r) => r.launched).length,
        };
        return { status: 200, body };
      },
    },
    {
      method: 'POST', path: new RegExp(`^/events/${EVENT_ID}/registrations$`),
      handle: async ({ request, identity, params: [id = ''] }) => {
        const { accountId } = parseAddRegistrationRequest(jsonBody(request));
        const { actor } = await accounts.authenticate(identity);
        const registration = await registrations.add(actor, id, accountId);
        return { status: 200, body: await registrationOf(registration, await eventById(id)) };
      },
    },
    {
      method: 'POST', path: new RegExp(`^/events/${EVENT_ID}/registrations/${ACCOUNT_ID}/(confirm|remove|launched)$`),
      handle: async ({ request, identity, params: [id = '', accountId = '', action = ''] }) => {
        const { actor } = await accounts.authenticate(identity);
        const registration = action === 'confirm'
          ? await registrations.confirmFor(actor, id, accountId)
          : action === 'remove'
            ? await registrations.remove(actor, id, accountId)
            : await registrations.setLaunched(actor, id, accountId, parseSetLaunchedRequest(jsonBody(request)).launched);
        return { status: 200, body: await registrationOf(registration, await eventById(id)) };
      },
    },
    {
      method: 'PUT', path: new RegExp(`^/events/${EVENT_ID}/judges$`),
      handle: async ({ request, identity, params: [id = ''] }) => {
        const { judges } = parseJudgesRequest(jsonBody(request));
        const { actor } = await accounts.authenticate(identity);
        const event = await events.setJudges(actor, id, judges);
        return { status: 200, body: { id: event.id, label: event.label, judges: event.judges } };
      },
    },
    {
      method: 'POST', path: /^\/staff\/search$/,
      handle: async ({ request, identity }) => {
        const { query } = parseSearchRequest(jsonBody(request));
        const { actor } = await accounts.authenticate(identity);
        return { status: 200, body: (await accounts.search(actor, query)).map(toAccount) };
      },
    },
    {
      method: 'GET', path: /^\/staff\/judges$/,
      handle: async ({ identity }) => {
        const { actor } = await accounts.authenticate(identity);
        return { status: 200, body: (await accounts.listJudges(actor)).map(toAccount) };
      },
    },
    {
      method: 'POST', path: new RegExp(`^/staff/accounts/${ACCOUNT_ID}/judge$`),
      handle: async ({ request, identity, params: [id = ''] }) => {
        const { judge } = parseSetJudgeRequest(jsonBody(request));
        const { actor } = await accounts.authenticate(identity);
        return { status: 200, body: toAccount(await accounts.setJudge(actor, id, judge)) };
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

  /** Rodada que vale agora: a última publicada, se for do evento ativo. Evento encerrado ou cancelado não muda. */
  const activeRound = async () => {
    const [current, active] = await Promise.all([registry.current(), events.active()]);
    return current && current.eventId === active?.id ? current : null;
  };

  const currentRef = async () => {
    const current = await activeRound();
    if (!current) throw new CommandRejected('round_not_paired', 'Nenhuma rodada publicada pelo TOM ainda');
    return current.ref;
  };

  const roundRoutes: Route[] = [
    {
      method: 'GET', path: /^\/round\/me$/,
      handle: async ({ identity }) => {
        const { actor } = await accounts.authenticate(identity);
        const current = await activeRound();
        const state = current ? await reader.state(current.ref) : null;
        return { status: 200, body: myRound(state, actor, clock.now()) };
      },
    },
    {
      method: 'POST', path: /^\/round\/report$/,
      handle: async ({ request, identity }) => {
        const { report } = parseReportRequest(jsonBody(request));
        const principal = await accounts.authenticate(identity);
        const { actor } = principal;
        // Quem julga o evento não joga nele.
        if (await isJudging(principal)) throw new CommandRejected('forbidden', 'Você é juiz deste evento');
        if (actor?.role !== 'player') throw new CommandRejected('forbidden', 'Informe seu Player ID para reportar pela própria mesa');
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
        const active = await events.active();
        const current = await registry.current();
        if (!active || current?.eventId !== active.id) {
          throw new CommandRejected('event_state', 'Nenhuma rodada do evento ativo publicada pelo TOM');
        }
        // Rodada 1: só depois de pedir a confirmação e com ninguém pendente.
        if (active.status === 'open') throw new CommandRejected('event_state', 'Peça a confirmação de presença antes de iniciar a rodada 1');
        if (active.status === 'confirming') {
          const pending = await registrations.pending(active.id);
          if (pending > 0) throw new CommandRejected('event_state', `Ainda há ${String(pending)} inscrito(s) sem confirmar presença`);
        }
        reader.remember(await rounds.startRound(actor, current.ref, { bestOf, roundMinutes: roundMinutes ?? active.roundMinutes }));
        if (active.status === 'confirming') await events.markRunning(active.id);
        return { status: 200, body: await board() };
      },
    },
  ];
  routes.push(...roundRoutes);

  /** Painel: ADM e juiz escalado no evento atual; cada comando aplica as regras do RoundService (papel, mesa travada, key lançada...). */
  const staff = async (identity: Identity) => {
    const principal = await accounts.authenticate(identity);
    const actor = staffActor(principal, await currentEvent());
    if (!actor) throw new CommandRejected('forbidden', 'Só o ADM e os juízes escalados no evento usam o painel');
    // Escalado por engano estando nas guias do TOM: quem joga a rodada não julga (nem a própria mesa).
    const { playerId } = principal.account;
    const current = actor.role === 'judge' && playerId ? await registry.current() : null;
    const tables = current ? (await reader.state(current.ref)).tables : [];
    if (tables.some((t) => t.player1.playerId === playerId || t.player2.playerId === playerId)) {
      throw new CommandRejected('forbidden', 'Você é juiz deste evento');
    }
    return actor;
  };
  /** Rodada pedida no caminho (`/panel/rounds/N/...`) ou a atual; só rodadas do torneio atual, de 1 até a mais recente. */
  const roundRef = async (round: string | undefined) => {
    const ref = await currentRef();
    if (round === undefined) return ref;
    const n = Number(round);
    if (n < 1 || n > ref.round) throw new CommandRejected('round_not_paired', `Rodada ${round} não publicada pelo TOM`);
    return { ...ref, round: n };
  };
  /** Rodadas anteriores iniciadas no site com key por lançar; as que ficaram só no TOM não contam. */
  const pendingKeys = async (latest: RoundRef) => {
    const previous = await Promise.all(Array.from({ length: latest.round - 1 }, (_, i) => rounds.state({ ...latest, round: i + 1 })));
    return previous
      .filter((s) => s.startedAt && !s.closed)
      .map((s) => ({ round: s.ref.round, tables: s.tables.filter((t) => !t.keyLaunched).map((t) => t.table) }));
  };
  const respond = async (state: Awaited<ReturnType<RoundService['state']>>, extra: Record<string, unknown> = {}): Promise<HttpResponse> => {
    const latest = (await activeRound())?.ref ?? null;
    // Só a rodada atual vai para o cache de leitura (o reporte do jogador lê dele).
    const shown = state.ref.round === latest?.round ? reader.remember(state) : state;
    const pending = latest ? await pendingKeys(latest) : [];
    return { status: 200, body: { ...panel(shown, clock.now(), latest?.round ?? null, pending), ...extra } };
  };
  const ROUND = String.raw`^\/panel(?:\/rounds\/(\d+))?`;
  const tableRoute = (action: string) => new RegExp(String.raw`${ROUND}\/tables\/(\d+)\/${action}$`);

  const panelRoutes: Route[] = [
    {
      method: 'GET', path: new RegExp(`${ROUND}$`),
      handle: async ({ identity, params: [round] }) => {
        await staff(identity);
        const current = await activeRound();
        if (!current) return { status: 200, body: panel(null, clock.now(), null) };
        const ref = await roundRef(round);
        const state = round === undefined ? await reader.state(ref) : await rounds.state(ref);
        return { status: 200, body: panel(state, clock.now(), current.ref.round, await pendingKeys(current.ref)) };
      },
    },
    {
      method: 'POST', path: tableRoute('override'),
      handle: async ({ request, identity, params: [round, table = ''] }) => {
        const { override, reason } = parseOverrideRequest(jsonBody(request));
        const actor = await staff(identity);
        const result = await rounds.applyOverride(actor, await roundRef(round), { table: Number(table), override, reason });
        return respond(result.state, { requiresTomFix: result.requiresTomFix });
      },
    },
    {
      method: 'POST', path: tableRoute('extend'),
      handle: async ({ request, identity, params: [round, table = ''] }) => {
        const { minutes } = parseExtendRequest(jsonBody(request));
        const actor = await staff(identity);
        return respond(await rounds.extendTime(actor, await roundRef(round), { table: Number(table), minutes }));
      },
    },
    {
      method: 'POST', path: tableRoute('key-launched'),
      handle: async ({ identity, params: [round, table = ''] }) => {
        const actor = await staff(identity);
        return respond(await rounds.markKeyLaunched(actor, await roundRef(round), { table: Number(table) }));
      },
    },
    {
      method: 'POST', path: tableRoute('report'),
      handle: async ({ request, identity, params: [round, table = ''] }) => {
        const { side, report } = parseStaffReportRequest(jsonBody(request));
        const actor = await staff(identity);
        return respond(await rounds.submitReport(actor, await roundRef(round), { table: Number(table), report, side }));
      },
    },
  ];
  routes.push(...panelRoutes);

  const openRoutes: OpenRoute[] = [
    {
      method: 'POST', path: /^\/uploads$/,
      handle: async (request) => ({
        status: 200,
        body: await ingest.withToken(request.headers['x-upload-token'] ?? '', parseUploadRequest(jsonBody(request))),
      }),
    },
    {
      method: 'GET', path: /^\/board$/,
      handle: async () => {
        // Muitas TVs e celulares olhando custam o mesmo que um: o CloudFront guarda por 5 s.
        return { status: 200, body: await board(), cacheControl: 'public, max-age=5' };
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
