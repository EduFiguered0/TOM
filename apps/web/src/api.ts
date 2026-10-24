import type {
  BoardResponse,
  CreateEventResponse,
  ErrorResponse,
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

/** API no mesmo endereço do site (`/api`), com o token de acesso do dispositivo. */
export const createApi = (session: Session, base = '/api', fetchFn: typeof fetch = (...args) => fetch(...args)) => {
  const call = async <T>(method: string, path: string, body?: unknown): Promise<ApiResult<T>> => {
    const token = await session.accessToken();
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
    createEvent: (label: string) => call<CreateEventResponse>('POST', '/events', { label }),
    myRound: () => call<MyRoundResponse>('GET', '/round/me'),
    report: (report: ReportDto) => call<MyRoundResponse>('POST', '/round/report', { report }),
    startRound: (bestOf: 1 | 3, roundMinutes: number | null) => call<BoardResponse>('POST', '/round/start', { bestOf, roundMinutes }),
    panel: () => call<PanelResponse>('GET', '/panel'),
    override: (table: number, override: OverrideDto, reason: string) =>
      call<PanelResponse & { requiresTomFix: boolean }>('POST', `/panel/tables/${String(table)}/override`, { override, reason }),
    extend: (table: number, minutes: number) => call<PanelResponse>('POST', `/panel/tables/${String(table)}/extend`, { minutes }),
    keyLaunched: (table: number) => call<PanelResponse>('POST', `/panel/tables/${String(table)}/key-launched`),
    staffReport: (table: number, side: 'player1' | 'player2', report: ReportDto) =>
      call<PanelResponse>('POST', `/panel/tables/${String(table)}/report`, { side, report }),
    revokeEvent: (id: string) => call<{ id: string; revoked: boolean }>('POST', `/events/${encodeURIComponent(id)}/revoke`),
  };
};

export type Api = ReturnType<typeof createApi>;
