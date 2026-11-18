import type { ProfileInput, StoreEvent, Utm } from '@tom/landing-core';
import type { Session } from '@tom/web-auth';
import { utmParams } from './utm.js';

export type PublicEvent = Omit<StoreEvent, 'salesCloseAt'> & { closed: boolean };

export interface MeResponse {
  lead: { leadId: string; fullName: string; email: string; phone: string | null; birthDate: string | null; status: string; marketingOptIn: boolean };
  termsAccepted: boolean;
  missing: ('phone' | 'birthDate' | 'terms')[];
}

export type Result<T> = { ok: true; body: T } | { ok: false; status: number; error: string; field?: string; message?: string };

const NETWORK = 'NETWORK';

/** Cliente da API da landing (mesmo endereço, /api, sem CORS). Sem login válido, responde 401 sem chamar a rede. */
export const createLandingApi = (session: Session, fetchFn: typeof fetch = fetch.bind(window)) => {
  const call = async <T>(method: string, path: string, { body, auth = true }: { body?: unknown; auth?: boolean } = {}): Promise<Result<T>> => {
    const headers: Record<string, string> = {};
    if (auth) {
      const token = await session.accessToken();
      if (!token) return { ok: false, status: 401, error: 'UNAUTHORIZED' };
      headers['Authorization'] = `Bearer ${token}`;
    }
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    try {
      const response = await fetchFn(`/api${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      const data = (await response.json()) as Record<string, unknown>;
      if (response.ok) return { ok: true, body: data as T };
      return {
        ok: false, status: response.status, error: typeof data['error'] === 'string' ? data['error'] : 'ERROR',
        ...(typeof data['field'] === 'string' ? { field: data['field'] } : {}),
        ...(typeof data['message'] === 'string' ? { message: data['message'] } : {}),
      };
    } catch {
      return { ok: false, status: 0, error: NETWORK };
    }
  };

  return {
    events: () => call<{ events: PublicEvent[] }>('GET', '/events', { auth: false }),
    me: (utm: Utm) => call<MeResponse>('GET', `/me?${new URLSearchParams(utmParams(utm)).toString()}`),
    saveProfile: (input: ProfileInput) => call<MeResponse>('PUT', '/me', { body: input }),
    checkout: (eventId: string, utm: Utm) => call<{ url: string }>('POST', '/checkout', { body: { eventId, utm: utmParams(utm) } }),
  };
};

export type LandingApi = ReturnType<typeof createLandingApi>;

/** Mensagem para a pessoa a partir do erro da API. */
export const errorMessage = (error: string): string => ({
  EVENT_CLOSED: 'Inscrições encerradas para este torneio.',
  EVENT_NOT_FOUND: 'Torneio não encontrado. Atualize a página.',
  PROFILE_INCOMPLETE: 'Complete o seu cadastro para continuar.',
  TERMS_OUTDATED: 'Aceite os Termos de Uso e a Política de Privacidade para continuar.',
  GOOGLE_ONLY: 'Entre com a sua conta Google.',
  UNAUTHORIZED: 'Sua sessão expirou. Entre de novo com o Google.',
  NETWORK: 'Sem conexão. Confira a internet e tente de novo.',
} as Record<string, string>)[error] ?? 'Algo deu errado. Tente de novo em instantes.';
