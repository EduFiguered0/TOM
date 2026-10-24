import {
  InvalidRequestError,
  parseConfirmPlayerIdRequest,
  parseRegisterRequest,
  parseSessionRequest,
  type AccountResponse,
  type ErrorResponse,
  type MeResponse,
} from '@tom/contracts';
import { CommandRejected, type Account, type AccountService, type Identity, type Principal, type RejectCode } from '@tom/core';

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

/** Identificador de conta no caminho: o `sub` do Cognito (UUID). */
const ACCOUNT_ID = '([0-9a-f-]{36})';

/** Roteador da API: uma Lambda atende todas as rotas. Todas exigem token de acesso válido. */
export const createApi = ({ tokens, emails, accounts, logError }: ApiDeps) => {
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
      method: 'GET', path: new RegExp(`^/accounts/${ACCOUNT_ID}$`),
      handle: async ({ identity, params: [id = ''] }) => {
        const { actor } = await accounts.authenticate(identity);
        return { status: 200, body: toAccount(await accounts.getAccount(actor, id)) };
      },
    },
    {
      method: 'POST', path: new RegExp(`^/accounts/${ACCOUNT_ID}/player-id$`),
      handle: async ({ request, identity, params: [id = ''] }) => {
        const { playerId } = parseConfirmPlayerIdRequest(jsonBody(request));
        const { actor } = await accounts.authenticate(identity);
        return { status: 200, body: toAccount(await accounts.confirmPlayerId(actor, id, playerId)) };
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

  return async (request: HttpRequest): Promise<HttpResponse> => {
    const found = match(request);
    if (!found) return error(404, 'not_found', 'Rota não encontrada');
    try {
      const token = bearer(request);
      const identity = await tokens.verify(token).catch(() => {
        throw new Unauthorized();
      });
      return await found.route.handle({ request, token, identity, params: found.params });
    } catch (e) {
      if (e instanceof Unauthorized) return error(401, 'unauthorized', 'Token ausente, inválido ou expirado');
      if (e instanceof InvalidRequestError) return error(400, 'invalid_input', e.message);
      if (e instanceof CommandRejected) return error(STATUS[e.code], e.code, e.message);
      logError(e);
      return error(500, 'internal', 'Erro interno; tente de novo');
    }
  };
};
