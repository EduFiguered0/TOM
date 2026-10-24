import type { ErrorResponse, MeResponse, RegisterRequest } from '@tom/contracts';
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
  };
};

export type Api = ReturnType<typeof createApi>;
