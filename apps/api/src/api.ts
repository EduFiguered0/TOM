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
  parseImageConsentRequest,
  parseNameRequest,
  parsePhotoRequest,
  parsePlayerIdRequest,
  parseStaffReportRequest,
  parseRegisterRequest,
  parseReportRequest,
  parseStartRoundRequest,
  parseSessionRequest,
  parseSetPaidRequest,
  parseChooseTournamentRequest,
  parseShowOnTvRequest,
  parseUploadRequest,
  type AccountResponse,
  type ActiveEventResponse,
  type EventDto,
  type InviteDto,
  type JoinResponse,
  type MyEventResponse,
  type MyRegistrationDto,
  type PlayerEventDto,
  type PhotoResponse,
  type PlayerRowDto,
  type TeamMemberDto,
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
  maskEmail,
  maskPhone,
  visiblePhoto,
  type Account,
  type AccountService,
  type EventRegistry,
  type EventService,
  type Identity,
  type JudgeInviteService,
  type PhotoService,
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
import { myRound, opponentOf, type RoundReader } from './rounds.js';

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
  invites: JudgeInviteService;
  photos: PhotoService;
  /** Chave da foto visível por Player ID (assento do oponente). */
  photoOf: (playerId: string) => Promise<string | null>;
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
  name_reviewed: 409,
  invite_invalid: 410,
  concurrency: 409,
  round_not_paired: 409,
  round_already_started: 409,
  round_not_started: 409,
  round_running: 409,
  nothing_to_extend: 409,
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
  // Campo a campo: nada interno do perfil vaza para a resposta.
  profile: {
    firstName: account.profile.firstName,
    lastName: account.profile.lastName,
    birthYear: account.profile.birthYear,
    phone: account.profile.phone,
    guardianConsent: account.profile.guardianConsent,
  },
  playerId: account.playerId,
  judge: account.judge === true,
  createdAt: account.createdAt.toISOString(),
});

/** Guia Jogadores: mascarado aqui, no servidor. */
const toPlayerRow = (account: Account): PlayerRowDto => ({
  id: account.id,
  playerId: account.playerId,
  firstName: account.profile.firstName,
  email: maskEmail(account.email),
  phone: maskPhone(account.profile.phone),
  photo: visiblePhoto(account, new Date()),
});

const toTeamMember = (account: Account): TeamMemberDto => ({ ...toPlayerRow(account), judge: account.judge === true });

const toMe = ({ account, actor }: Principal, judging: boolean): MeResponse => ({
  ...toAccount(account),
  role: actor?.role === 'admin' ? 'admin' : 'player',
  canAct: actor !== null,
  judge: account.judge === true,
  judging,
  nameReviewed: account.nameReviewed,
  photo: account.photoId ?? null,
  imageConsent: account.imageConsent === true,
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
  firstName: r.firstName,
  lastName: r.lastName,
  birthYear: r.birthYear,
  at: r.at.toISOString(),
  by: r.by,
  awaitingApproval: r.awaitingApproval,
  launched: r.launched,
  removed: r.removed,
  paid: r.paid,
  inRound,
});

/** O jogador vê a própria inscrição sem o pagamento. */
const ownRegistration = (dto: RegistrationDto): MyRegistrationDto => {
  const own: Partial<RegistrationDto> = { ...dto };
  delete own.paid;
  return own as MyRegistrationDto;
};

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
const INVITE_CODE = '([A-Z0-9]{10})';
/** Player ID no caminho: só dígitos. */
const PLAYER_ID = '([0-9]{1,20})';

/** Roteador da API: uma Lambda atende todas as rotas. Todas exigem token de acesso válido. */
export const createApi = ({ tokens, emails, accounts, events, ingest, board, rounds, reader, registry, registrations, invites, photos, photoOf, clock, logError }: ApiDeps) => {
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
  /** Evento ativo para o painel; sem ele, o último evento (para reexibir a classificação na TV). */
  const activeResponse = async (): Promise<ActiveEventResponse> => {
    const event = await events.active();
    if (event) return { event: toEvent(event, true), last: null };
    const last = (await registry.latest())?.event;
    return {
      event: null,
      last: last
        ? { id: last.id, label: last.label, date: last.date, onTv: last.onTv, canShow: last.status === 'closed' && last.standings !== null }
        : null,
    };
  };

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
        return { status: 200, body: { event: toEvent(event), registration: ownRegistration(await registrationOf(registration, event)) } satisfies JoinResponse };
      },
    },
    {
      method: 'GET', path: /^\/me\/event$/,
      handle: async ({ identity }) => {
        const mine = await registrations.mine(await accounts.authenticate(identity));
        const body: MyEventResponse = {
          event: mine ? toEvent(mine.event) : null,
          registration: mine?.registration ? ownRegistration(await registrationOf(mine.registration, mine.event)) : null,
          placement: mine?.registration && !mine.registration.removed ? await placementOf(mine.event, mine.registration.playerId) : null,
        };
        return { status: 200, body };
      },
    },
    {
      method: 'POST', path: new RegExp(`^/invites/${INVITE_CODE}/accept$`),
      handle: async ({ identity, params: [code = ''] }) => {
        await invites.accept(await accounts.authenticate(identity), code);
        return { status: 200, body: await me(await accounts.authenticate(identity)) };
      },
    },
    {
      method: 'POST', path: /^\/me\/photo$/,
      handle: async ({ request, identity }) => {
        const { photo } = parsePhotoRequest(jsonBody(request));
        await accounts.authenticate(identity);
        if (photo === null) await photos.remove(identity); else await photos.upload(identity, photo);
        return { status: 200, body: await me(await accounts.authenticate(identity)) };
      },
    },
    {
      method: 'POST', path: /^\/me\/image-consent$/,
      handle: async ({ request, identity }) => {
        const { consent } = parseImageConsentRequest(jsonBody(request));
        await accounts.authenticate(identity);
        await accounts.setImageConsent(identity, consent);
        return { status: 200, body: await me(await accounts.authenticate(identity)) };
      },
    },
    {
      method: 'GET', path: /^\/photos\/([A-Za-z0-9-]{1,64})$/,
      handle: async ({ identity, params: [id = ''] }) => {
        // Quem tem a chave vê: ela só sai do servidor para quem pode ver (ADM no quadro, oponente na mesa).
        const { account } = await accounts.authenticate(identity);
        return { status: 200, body: { photo: await photos.read(id, account.id) } satisfies PhotoResponse };
      },
    },
    {
      method: 'POST', path: /^\/me\/name$/,
      handle: async ({ request, identity }) => {
        const name = parseNameRequest(jsonBody(request));
        await accounts.authenticate(identity);
        await accounts.confirmName(identity, name);
        return { status: 200, body: await me(await accounts.authenticate(identity)) };
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
        return { status: 200, body: toPlayerRow(await accounts.findByPlayerId(actor, pid)) };
      },
    },
    {
      method: 'POST', path: /^\/staff\/invites$/,
      handle: async ({ identity }) => {
        const { actor } = await accounts.authenticate(identity);
        const invite = await invites.create(actor);
        return { status: 201, body: { code: invite.code, expiresAt: invite.expiresAt.toISOString() } satisfies InviteDto };
      },
    },
    {
      method: 'GET', path: /^\/staff\/invites$/,
      handle: async ({ identity }) => {
        const { actor } = await accounts.authenticate(identity);
        return { status: 200, body: (await invites.open(actor)).map((i): InviteDto => ({ code: i.code, expiresAt: i.expiresAt.toISOString() })) };
      },
    },
    {
      method: 'POST', path: new RegExp(`^/staff/invites/${INVITE_CODE}/cancel$`),
      handle: async ({ identity, params: [code = ''] }) => {
        const { actor } = await accounts.authenticate(identity);
        await invites.cancel(actor, code);
        return { status: 204, body: null };
      },
    },
    {
      method: 'POST', path: new RegExp(`^/players/${ACCOUNT_ID}/photo/remove$`),
      handle: async ({ identity, params: [accountId = ''] }) => {
        const { actor } = await accounts.authenticate(identity);
        return { status: 200, body: toPlayerRow(await photos.removeByAdmin(actor, accountId)) };
      },
    },
    {
      method: 'POST', path: /^\/players\/search$/,
      handle: async ({ request, identity }) => {
        const { query } = parseSearchRequest(jsonBody(request));
        const { actor } = await accounts.authenticate(identity);
        return { status: 200, body: (await accounts.players(actor, query)).map(toPlayerRow) };
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
        return { status: 200, body: toPlayerRow(account) };
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
      method: 'POST', path: new RegExp(`^/events/${EVENT_ID}/tv$`),
      handle: async ({ request, identity, params: [id = ''] }) => {
        const { on } = parseShowOnTvRequest(jsonBody(request));
        const { actor } = await accounts.authenticate(identity);
        await events.showOnTv(actor, id, on);
        return { status: 200, body: await activeResponse() };
      },
    },
    {
      method: 'GET', path: /^\/events\/active$/,
      handle: async ({ identity }) => {
        await requireAdmin(identity);
        return { status: 200, body: await activeResponse() };
      },
    },
    {
      method: 'POST', path: new RegExp(`^/events/${EVENT_ID}/tournament$`),
      handle: async ({ request, identity, params: [id = ''] }) => {
        const { tournament } = parseChooseTournamentRequest(jsonBody(request));
        const { actor } = await accounts.authenticate(identity);
        return { status: 200, body: toEvent(await events.chooseTournament(actor, id, tournament), true) };
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
        const playing = kept.filter((r) => !r.awaitingApproval);
        const body: RegistrationsResponse = {
          // Removidos no fim: a lista que interessa é a de quem vai jogar.
          registrations: [...kept, ...list.filter((r) => r.removed)].map((r) => toRegistration(r, players ? players.has(r.playerId) : null)),
          total: playing.length,
          awaiting: kept.length - playing.length,
          launched: playing.filter((r) => r.launched).length,
          paid: playing.filter((r) => r.paid).length,
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
      method: 'POST', path: new RegExp(`^/events/${EVENT_ID}/registrations/${ACCOUNT_ID}/(approve|remove|launched|paid)$`),
      handle: async ({ request, identity, params: [id = '', accountId = '', action = ''] }) => {
        const { actor } = await accounts.authenticate(identity);
        const registration = action === 'approve'
          ? await registrations.approve(actor, id, accountId)
          : action === 'remove'
            ? await registrations.remove(actor, id, accountId)
            : action === 'paid'
              ? await registrations.setPaid(actor, id, accountId, parseSetPaidRequest(jsonBody(request)).paid)
              : await registrations.setLaunched(actor, id, accountId, parseSetLaunchedRequest(jsonBody(request)).launched);
        return { status: 200, body: await registrationOf(registration, await eventById(id)) };
      },
    },
    {
      method: 'GET', path: new RegExp(`^/accounts/${ACCOUNT_ID}/events$`),
      handle: async ({ identity, params: [accountId = ''] }) => {
        const { actor } = await accounts.authenticate(identity);
        return { status: 200, body: (await registrations.history(actor, accountId)) satisfies PlayerEventDto[] };
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
        return { status: 200, body: (await accounts.search(actor, query)).map(toTeamMember) };
      },
    },
    {
      method: 'GET', path: /^\/staff\/judges$/,
      handle: async ({ identity }) => {
        const { actor } = await accounts.authenticate(identity);
        return { status: 200, body: (await accounts.listJudges(actor)).map(toTeamMember) };
      },
    },
    {
      method: 'POST', path: new RegExp(`^/staff/accounts/${ACCOUNT_ID}/judge$`),
      handle: async ({ request, identity, params: [id = ''] }) => {
        const { judge } = parseSetJudgeRequest(jsonBody(request));
        const { actor } = await accounts.authenticate(identity);
        return { status: 200, body: toTeamMember(await accounts.setJudge(actor, id, judge)) };
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

  /**
   * Colocação final do jogador. Os standings do TOM só trazem o nome, e o nome no TOM pode ser outro que o do cadastro:
   * o nome do TOM sai das guias (Player ID + nome), da última rodada para trás (o jogador pode ter tido bye).
   */
  const placementOf = async (event: TournamentEvent, playerId: string): Promise<MyEventResponse['placement']> => {
    const current = await registry.current();
    if (!event.standings || current?.eventId !== event.id) return null;
    for (let round = current.ref.round; round >= 1; round--) {
      const { tables } = await rounds.state({ ...current.ref, round });
      const seat = tables.flatMap((t) => [t.player1, t.player2]).find((p) => p.playerId === playerId);
      if (!seat) continue;
      const division = event.standings.filter((s) => s.division === current.ref.division);
      const mine = division.find((s) => s.name === seat.name);
      return mine ? { rank: mine.rank, total: division.length, wins: mine.wins, losses: mine.losses, ties: mine.ties, points: mine.points } : null;
    }
    return null;
  };

  const roundRoutes: Route[] = [
    {
      method: 'GET', path: /^\/round\/me$/,
      handle: async ({ identity }) => {
        const { actor } = await accounts.authenticate(identity);
        const current = await activeRound();
        const state = current ? await reader.state(current.ref) : null;
        const opponent = opponentOf(state, actor);
        return { status: 200, body: myRound(state, actor, clock.now(), opponent ? await photoOf(opponent) : null) };
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
        const opponent = opponentOf(state, actor);
        return { status: 200, body: myRound(state, actor, clock.now(), opponent ? await photoOf(opponent) : null) };
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
        reader.remember(await rounds.startRound(actor, current.ref, { bestOf, roundMinutes: roundMinutes ?? active.roundMinutes }));
        // Rodada 1: o evento passa a em andamento; quem escanear daqui em diante espera o ADM aprovar.
        if (active.status === 'open') await events.markRunning(active.id);
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
      method: 'POST', path: new RegExp(String.raw`${ROUND}\/extend$`),
      handle: async ({ request, identity, params: [round] }) => {
        const extra = parseExtendRequest(jsonBody(request));
        const actor = await staff(identity);
        return respond(await rounds.extendRound(actor, await roundRef(round), extra));
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
  routes.push({
    method: 'GET', path: /^\/board$/,
    handle: async ({ identity }) => {
      // A TV é extensão do painel do ADM (nomes e fotos dos jogadores): só com sessão de ADM, sem cache compartilhado.
      await requireAdmin(identity);
      return { status: 200, body: await board() };
    },
  });

  const openRoutes: OpenRoute[] = [
    {
      method: 'POST', path: /^\/uploads$/,
      handle: async (request) => ({
        status: 200,
        body: await ingest.withToken(request.headers['x-upload-token'] ?? '', parseUploadRequest(jsonBody(request))),
      }),
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
