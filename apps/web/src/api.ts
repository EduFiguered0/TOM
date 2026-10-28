import type {
  ActiveEventResponse,
  CreateEventRequest,
  EventDto,
  RegistrationsResponse,
  UpdateEventRequest,
  UploadRequest,
  UploadResponse,
  BoardResponse,
  CreateEventResponse,
  ErrorResponse,
  ExtendRequest,
  JoinResponse,
  MyEventResponse,
  InviteDto,
  PhotoResponse,
  PlayerEventDto,
  PlayerRowDto,
  RegistrationDto,
  TeamMemberDto,
  MeResponse,
  MyRoundResponse,
  OverrideDto,
  PanelResponse,
  RegisterRequest,
  ReportDto,
} from '@tom/contracts';
import type { Session } from './auth/session.js';

export type ApiResult<T> = { ok: true; status: number; body: T } | { ok: false; status: number; error: ErrorResponse };

/** Sem resposta da API (sem internet, servidor fora): a tela nunca mostra sucesso nesse caso. */
export class OfflineError extends Error {
  override name = 'OfflineError';

  constructor() {
    super('Sem conexão com o servidor. Nada foi enviado; tente de novo.');
  }
}

/** Painel da rodada atual ou de uma anterior (`/panel/rounds/N`). */
const panelPath = (round?: number) => (round === undefined ? '/panel' : `/panel/rounds/${String(round)}`);
const tablePath = (round: number | undefined, table: number, action: string) => `${panelPath(round)}/tables/${String(table)}/${action}`;

/** API no mesmo endereço do site (`/api`), com o token de acesso do dispositivo. */
export const createApi = (session: Session, base = '/api', fetchFn: typeof fetch = (...args) => fetch(...args)) => {
  const call = async <T>(method: string, path: string, body?: unknown): Promise<ApiResult<T>> => {
    // Renovar o login sem rede não desloga: vira "sem conexão" e a próxima chamada tenta de novo.
    const token = await session.accessToken().catch(() => { throw new OfflineError(); });
    if (!token) return { ok: false, status: 401, error: { error: 'unauthorized', message: 'Entre de novo.' } };
    let response: Response;
    try {
      response = await fetchFn(base + path, {
        method,
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch {
      throw new OfflineError();
    }
    const data = (await response.json().catch(() => ({ error: 'invalid_response', message: 'Resposta inválida do servidor.' }))) as unknown;
    return response.ok ? { ok: true, status: response.status, body: data as T } : { ok: false, status: response.status, error: data as ErrorResponse };
  };

  return {
    me: () => call<MeResponse>('GET', '/me'),
    register: (request: RegisterRequest) => call<MeResponse>('POST', '/me', request),
    activateSession: (replace: boolean) => call<MeResponse>('POST', '/session', { replace }),
    joinEvent: (code: string) => call<JoinResponse>('POST', `/join/${encodeURIComponent(code)}`),
    myEvent: () => call<MyEventResponse>('GET', '/me/event'),
    claimPlayerId: (playerId: string) => call<MeResponse>('POST', '/me/player-id', { playerId }),
    confirmName: (firstName: string, lastName: string) => call<MeResponse>('POST', '/me/name', { firstName, lastName }),
    setPhoto: (photo: string | null) => call<MeResponse>('POST', '/me/photo', { photo }),
    setImageConsent: (consent: boolean) => call<MeResponse>('POST', '/me/image-consent', { consent }),
    photo: (id: string) => call<PhotoResponse>('GET', `/photos/${encodeURIComponent(id)}`),
    removePlayerPhoto: (accountId: string) => call<PlayerRowDto>('POST', `/players/${encodeURIComponent(accountId)}/photo/remove`),
    players: (query: string) => call<PlayerRowDto[]>('POST', '/players/search', { query }),
    createInvite: () => call<InviteDto>('POST', '/staff/invites'),
    openInvites: () => call<InviteDto[]>('GET', '/staff/invites'),
    cancelInvite: (code: string) => call<null>('POST', `/staff/invites/${encodeURIComponent(code)}/cancel`),
    acceptInvite: (code: string) => call<MeResponse>('POST', `/invites/${encodeURIComponent(code)}/accept`),
    unlinkPlayerId: (playerId: string) => call<PlayerRowDto>('POST', `/player-ids/${encodeURIComponent(playerId)}/unlink`),
    createEvent: (request: CreateEventRequest) => call<CreateEventResponse>('POST', '/events', request),
    activeEvent: () => call<ActiveEventResponse>('GET', '/events/active'),
    showOnTv: (eventId: string, on: boolean) => call<ActiveEventResponse>('POST', `/events/${encodeURIComponent(eventId)}/tv`, { on }),
    uploadAsAdmin: (request: UploadRequest) => call<UploadResponse>('POST', '/events/active/uploads', request),
    chooseTournament: (eventId: string, tournament: string) =>
      call<EventDto>('POST', `/events/${encodeURIComponent(eventId)}/tournament`, { tournament }),
    updateEvent: (eventId: string, change: UpdateEventRequest) => call<EventDto>('PATCH', `/events/${encodeURIComponent(eventId)}`, change),
    eventAction: (eventId: string, action: 'close' | 'cancel') =>
      call<EventDto>('POST', `/events/${encodeURIComponent(eventId)}/${action}`),
    registrations: (eventId: string) => call<RegistrationsResponse>('GET', `/events/${encodeURIComponent(eventId)}/registrations`),
    addRegistration: (eventId: string, accountId: string) =>
      call<RegistrationDto>('POST', `/events/${encodeURIComponent(eventId)}/registrations`, { accountId }),
    registrationAction: (eventId: string, accountId: string, action: 'approve' | 'remove') =>
      call<RegistrationDto>('POST', `/events/${encodeURIComponent(eventId)}/registrations/${encodeURIComponent(accountId)}/${action}`),
    setPaid: (eventId: string, accountId: string, paid: boolean) =>
      call<RegistrationDto>('POST', `/events/${encodeURIComponent(eventId)}/registrations/${encodeURIComponent(accountId)}/paid`, { paid }),
    playerEvents: (accountId: string) => call<PlayerEventDto[]>('GET', `/accounts/${encodeURIComponent(accountId)}/events`),
    setLaunched: (eventId: string, accountId: string, launched: boolean) =>
      call<RegistrationDto>('POST', `/events/${encodeURIComponent(eventId)}/registrations/${encodeURIComponent(accountId)}/launched`, { launched }),
    searchAccounts: (query: string) => call<TeamMemberDto[]>('POST', '/staff/search', { query }),
    judges: () => call<TeamMemberDto[]>('GET', '/staff/judges'),
    setJudge: (accountId: string, judge: boolean) =>
      call<TeamMemberDto>('POST', `/staff/accounts/${encodeURIComponent(accountId)}/judge`, { judge }),
    myRound: () => call<MyRoundResponse>('GET', '/round/me'),
    report: (report: ReportDto) => call<MyRoundResponse>('POST', '/round/report', { report }),
    board: () => call<BoardResponse>('GET', '/board'),
    startRound: (bestOf: 1 | 3, roundMinutes: number | null) => call<BoardResponse>('POST', '/round/start', { bestOf, roundMinutes }),
    panel: (round?: number) => call<PanelResponse>('GET', panelPath(round)),
    override: (table: number, override: OverrideDto, round?: number) =>
      call<PanelResponse & { requiresTomFix: boolean }>('POST', tablePath(round, table, 'override'), { override }),
    /** Acréscimo da rodada para as mesas sem resultado: minutos ou turnos extras. */
    extend: (extra: ExtendRequest) => call<PanelResponse>('POST', `${panelPath()}/extend`, extra),
    keyLaunched: (table: number, round?: number) => call<PanelResponse>('POST', tablePath(round, table, 'key-launched')),
    staffReport: (table: number, side: 'player1' | 'player2', report: ReportDto, round?: number) =>
      call<PanelResponse>('POST', tablePath(round, table, 'report'), { side, report }),
    revokeEvent: (id: string) => call<{ id: string; revoked: boolean }>('POST', `/events/${encodeURIComponent(id)}/revoke`),
  };
};

export type Api = ReturnType<typeof createApi>;
