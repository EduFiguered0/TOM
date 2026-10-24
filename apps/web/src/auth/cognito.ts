/** Login sem senha direto na API do Cognito (sem Amplify): cadastro e entrada pelo mesmo fluxo de código por e-mail. */

export interface CognitoConfig {
  region: string;
  clientId: string;
}

export interface Tokens {
  access: string;
  refresh: string;
  /** Epoch em ms. */
  expiresAt: number;
}

/** Código enviado e aguardando digitação. `signup` = primeira vez (confirma o e-mail e já entra). */
export interface PendingCode {
  kind: 'signup' | 'signin';
  email: string;
  session: string;
}

const MESSAGES: Record<string, string> = {
  CodeMismatchException: 'Código incorreto. Confira o e-mail e tente de novo.',
  ExpiredCodeException: 'Código expirado. Peça um novo.',
  NotAuthorizedException: 'Tempo esgotado ou tentativas demais. Peça um novo código.',
  LimitExceededException: 'Muitas tentativas. Aguarde alguns minutos.',
  TooManyRequestsException: 'Muitas tentativas. Aguarde alguns minutos.',
  InvalidParameterException: 'E-mail inválido.',
};

export class AuthError extends Error {
  override name = 'AuthError';

  constructor(readonly type: string, detail: string) {
    super(MESSAGES[type] ?? `Não foi possível entrar (${detail || type}).`);
  }
}

type Json = Record<string, unknown>;
interface AuthResult { AuthenticationResult?: { AccessToken: string; RefreshToken?: string; ExpiresIn: number } }

export const createCognito = ({ region, clientId }: CognitoConfig, fetchFn: typeof fetch = fetch, now = () => Date.now()) => {
  const call = async <T>(action: string, body: Json): Promise<T> => {
    const response = await fetchFn(`https://cognito-idp.${region}.amazonaws.com/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-amz-json-1.1', 'X-Amz-Target': `AWSCognitoIdentityProviderService.${action}` },
      body: JSON.stringify({ ClientId: clientId, ...body }),
    });
    const data = (await response.json()) as Json;
    if (!response.ok) {
      const failure = data as { __type?: string; message?: string };
      const type = (failure.__type ?? String(response.status)).split('#').pop() ?? '';
      throw new AuthError(type, failure.message ?? '');
    }
    return data as T;
  };

  const tokens = (result: AuthResult, refresh?: string): Tokens => {
    const auth = result.AuthenticationResult;
    const refreshToken = auth?.RefreshToken ?? refresh;
    if (!auth || !refreshToken) throw new AuthError('NoTokens', 'resposta sem tokens');
    return { access: auth.AccessToken, refresh: refreshToken, expiresAt: now() + auth.ExpiresIn * 1000 };
  };

  return {
    /** Primeira vez: cria a conta sem senha e o Cognito envia o código. Já cadastrado: envia o código de login. */
    async start(rawEmail: string): Promise<PendingCode> {
      const email = rawEmail.trim().toLowerCase();
      try {
        const { Session } = await call<{ Session: string }>('SignUp', { Username: email, UserAttributes: [{ Name: 'email', Value: email }] });
        return { kind: 'signup', email, session: Session };
      } catch (e) {
        if (!(e instanceof AuthError) || e.type !== 'UsernameExistsException') throw e;
      }
      const { Session } = await call<{ Session: string }>('InitiateAuth', {
        AuthFlow: 'USER_AUTH',
        AuthParameters: { USERNAME: email, PREFERRED_CHALLENGE: 'EMAIL_OTP' },
      });
      return { kind: 'signin', email, session: Session };
    },

    async verify(pending: PendingCode, rawCode: string): Promise<Tokens> {
      const code = rawCode.replace(/\D/g, '');
      if (pending.kind === 'signup') {
        const { Session } = await call<{ Session: string }>('ConfirmSignUp', {
          Username: pending.email, ConfirmationCode: code, Session: pending.session,
        });
        return tokens(await call<AuthResult>('InitiateAuth', { AuthFlow: 'USER_AUTH', AuthParameters: { USERNAME: pending.email }, Session }));
      }
      return tokens(await call<AuthResult>('RespondToAuthChallenge', {
        ChallengeName: 'EMAIL_OTP',
        Session: pending.session,
        ChallengeResponses: { USERNAME: pending.email, EMAIL_OTP_CODE: code },
      }));
    },

    async refresh(refreshToken: string): Promise<Tokens> {
      return tokens(await call<AuthResult>('InitiateAuth', { AuthFlow: 'REFRESH_TOKEN_AUTH', AuthParameters: { REFRESH_TOKEN: refreshToken } }), refreshToken);
    },

    /** Sair: invalida o token de renovação deste dispositivo. */
    async revoke(refreshToken: string): Promise<void> {
      await call('RevokeToken', { Token: refreshToken });
    },
  };
};

export type Cognito = ReturnType<typeof createCognito>;
