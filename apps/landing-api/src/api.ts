import { cleanUtm, InvalidLeadError, isClosed, type ProfileInput, type StoreConfig } from '@tom/landing-core';
import { GoogleOnlyError, type GoogleIdentity, type ProfileLookup, type Verifier } from './identity.js';
import { LeadConflictError } from './lead-repository.js';
import { LeadNotFoundError, type LeadService, type MeView } from './lead-service.js';

export interface ApiRequest {
  method: string;
  path: string;
  headers: Record<string, string | undefined>;
  query: Record<string, string | undefined>;
  body: string | null;
}

export interface ApiResponse {
  status: number;
  body: unknown;
  cacheControl?: string;
}

interface Deps {
  verifier: Verifier;
  profiles: ProfileLookup;
  service: LeadService;
  config: StoreConfig;
  now: () => Date;
  logError: (error: unknown) => void;
}

const MAX_BODY = 4096;

class HttpError extends Error {
  constructor(readonly status: number, readonly body: Record<string, unknown>) {
    super(String(body['error']));
  }
}

const json = (body: string | null): Record<string, unknown> => {
  if (!body || body.length > MAX_BODY) throw new HttpError(400, { error: 'BAD_REQUEST' });
  try {
    const parsed: unknown = JSON.parse(body);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch { /* abaixo */ }
  throw new HttpError(400, { error: 'BAD_REQUEST' });
};

const text = (value: unknown) => (typeof value === 'string' ? value : '');

const profileInput = (body: Record<string, unknown>): ProfileInput => ({
  fullName: text(body['fullName']),
  phone: text(body['phone']),
  birthDate: text(body['birthDate']),
  acceptTerms: body['acceptTerms'] === true,
  marketingOptIn: body['marketingOptIn'] === true,
});

/** O que vai para o navegador: sem os identificadores do Google e do Cognito. */
const publicView = ({ lead, termsAccepted, missing }: MeView) => ({
  lead: {
    leadId: lead.leadId, fullName: lead.fullName, email: lead.email, phone: lead.phone, birthDate: lead.birthDate,
    status: lead.status, marketingOptIn: lead.marketingOptIn,
  },
  termsAccepted,
  missing,
});

const REFUSAL_STATUS = { PROFILE_INCOMPLETE: 409, TERMS_OUTDATED: 409, EVENT_CLOSED: 409, EVENT_NOT_FOUND: 404 } as const;

/** Roteador da landing (mesmo formato da API do TOM): /events público; /me e /checkout com login Google. */
export const createLandingApi = ({ verifier, profiles, service, config, now, logError }: Deps) => {
  const tokenOf = (req: ApiRequest) => {
    const match = /^Bearer (.+)$/.exec(req.headers['authorization'] ?? '');
    if (!match?.[1]) throw new HttpError(401, { error: 'UNAUTHORIZED' });
    return match[1];
  };

  const identify = async (token: string): Promise<GoogleIdentity> => {
    try {
      return await verifier.verify(token);
    } catch (error) {
      if (error instanceof GoogleOnlyError) throw new HttpError(403, { error: 'GOOGLE_ONLY' });
      throw new HttpError(401, { error: 'UNAUTHORIZED' });
    }
  };

  const route = async (req: ApiRequest): Promise<ApiResponse> => {
    const key = `${req.method} ${req.path}`;
    if (key === 'GET /events') {
      const events = config.events.map(({ salesCloseAt, ...event }) => ({ ...event, closed: isClosed({ ...event, salesCloseAt }, now()) }));
      return { status: 200, body: { events }, cacheControl: 'public, max-age=60' };
    }
    if (!['GET /me', 'PUT /me', 'POST /checkout'].includes(key)) return { status: 404, body: { error: 'NOT_FOUND' } };

    const token = tokenOf(req);
    const id = await identify(token);
    if (key === 'GET /me') {
      const utm = cleanUtm(req.query);
      return { status: 200, body: publicView(await service.me(id, await profiles.profile(token), utm)) };
    }
    const body = json(req.body);
    if (key === 'PUT /me') return { status: 200, body: publicView(await service.update(id, profileInput(body))) };

    const raw = body['utm'];
    const utm = cleanUtm(raw && typeof raw === 'object' ? raw : {});
    const result = await service.checkout(id, text(body['eventId']), utm);
    if (!result.ok) return { status: REFUSAL_STATUS[result.reason], body: { error: result.reason } };
    return { status: 200, body: { url: result.url } };
  };

  return async (req: ApiRequest): Promise<ApiResponse> => {
    try {
      return await route(req);
    } catch (error) {
      if (error instanceof HttpError) return { status: error.status, body: error.body };
      if (error instanceof InvalidLeadError) return { status: 400, body: { error: 'INVALID', field: error.field, message: error.message } };
      if (error instanceof LeadNotFoundError) return { status: 404, body: { error: 'LEAD_NOT_FOUND' } };
      if (error instanceof LeadConflictError) return { status: 409, body: { error: 'CONFLICT' } };
      logError(error);
      return { status: 500, body: { error: 'INTERNAL' } };
    }
  };
};
