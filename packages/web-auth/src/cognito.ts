/** Login com e-mail e senha direto na API do Cognito (sem Amplify); o cadastro é confirmado na hora, sem código. */

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

/** Contas antigas (código por e-mail) não têm senha: o caminho delas é o "Esqueci minha senha". */
const WRONG_LOGIN = 'E-mail ou senha incorretos. Conta antiga ou senha esquecida? Use "Esqueci minha senha".';

const MESSAGES: Record<string, string> = {
  CodeMismatchException: 'Código incorreto. Confira o e-mail e tente de novo.',
  ExpiredCodeException: 'Código expirado. Peça um novo.',
  NotAuthorizedException: WRONG_LOGIN,
  UserNotFoundException: WRONG_LOGIN,
  // Usuário sem senha: o Cognito oferece outro desafio em vez dos tokens.
  NoTokens: WRONG_LOGIN,
  UsernameExistsException: 'Esse e-mail já tem conta. Entre com a sua senha ou pelo Google.',
  InvalidPasswordException: 'A senha precisa ter pelo menos 8 caracteres, com uma letra minúscula e um número.',
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

  const normalize = (email: string) => email.trim().toLowerCase();
  const digits = (code: string) => code.replace(/\D/g, '');

  const signIn = async (rawEmail: string, password: string): Promise<Tokens> => {
    const email = normalize(rawEmail);
    return tokens(await call<AuthResult>('InitiateAuth', {
      AuthFlow: 'USER_AUTH',
      AuthParameters: { USERNAME: email, PASSWORD: password, PREFERRED_CHALLENGE: 'PASSWORD' },
    }));
  };

  return {
    signIn,

    /** O gatilho de pré-cadastro confirma a conta na hora: entra em seguida. */
    async signUp(rawEmail: string, password: string): Promise<Tokens> {
      const email = normalize(rawEmail);
      await call('SignUp', { Username: email, Password: password, UserAttributes: [{ Name: 'email', Value: email }] });
      return signIn(email, password);
    },

    /** Único e-mail que o sistema manda: o código para criar uma nova senha. */
    async forgotPassword(rawEmail: string): Promise<void> {
      await call('ForgotPassword', { Username: normalize(rawEmail) });
    },

    async resetPassword(rawEmail: string, code: string, password: string): Promise<void> {
      await call('ConfirmForgotPassword', { Username: normalize(rawEmail), ConfirmationCode: digits(code), Password: password });
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
