import {
  InvalidRequestError,
  parseRegisterRequest,
  parseSessionRequest,
  type ErrorResponse,
  type MeResponse,
} from '@tom/contracts';
import { CommandRejected, type AccountService, type Identity, type Principal, type RejectCode } from '@tom/core';

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
  concurrency: 409,
  round_not_paired: 409,
  round_already_started: 409,
  round_not_started: 409,
  previous_round_open: 409,
  side_required: 400,
  table_locked: 409,
  not_green: 409,
  key_already_launched: 409,
};

class Unauthorized extends Error {}

const error = (status: number, code: string, message: string): HttpResponse => ({
  status,
  body: { error: code, message } satisfies ErrorResponse,
});

const toMe = ({ account, actor }: Principal): MeResponse => ({
  id: account.id,
  email: account.email,
  profile: account.profile,
  playerId: account.playerId,
  role: actor?.role === 'admin' || actor?.role === 'judge' ? actor.role : 'player',
  canAct: actor !== null,
  createdAt: account.createdAt.toISOString(),
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

type Route = (request: HttpRequest, token: string, identity: Identity) => Promise<HttpResponse>;

/** Roteador da API: uma Lambda atende todas as rotas. Todas exigem token de acesso válido. */
export const createApi = ({ tokens, emails, accounts, logError }: ApiDeps) => {
  const routes: Record<string, Route> = {
    'GET /me': async (_, __, identity) => ({ status: 200, body: toMe(await accounts.authenticate(identity)) }),

    'POST /me': async (request, token, identity) => {
      const input = parseRegisterRequest(jsonBody(request));
      await accounts.register(identity, await emails.verifiedEmail(token), input);
      return { status: 201, body: toMe(await accounts.authenticate(identity)) };
    },

    'POST /session': async (request, _, identity) => {
      const { replace } = parseSessionRequest(jsonBody(request));
      await accounts.activateSession(identity, replace);
      return { status: 200, body: toMe(await accounts.authenticate(identity)) };
    },
  };

  return async (request: HttpRequest): Promise<HttpResponse> => {
    const route = routes[`${request.method} ${request.path}`];
    if (!route) return error(404, 'not_found', 'Rota não encontrada');
    try {
      const token = bearer(request);
      const identity = await tokens.verify(token).catch(() => {
        throw new Unauthorized();
      });
      return await route(request, token, identity);
    } catch (e) {
      if (e instanceof Unauthorized) return error(401, 'unauthorized', 'Token ausente, inválido ou expirado');
      if (e instanceof InvalidRequestError) return error(400, 'invalid_input', e.message);
      if (e instanceof CommandRejected) return error(STATUS[e.code], e.code, e.message);
      logError(e);
      return error(500, 'internal', 'Erro interno; tente de novo');
    }
  };
};
