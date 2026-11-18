import { CognitoIdentityProviderClient, GetUserCommand } from '@aws-sdk/client-cognito-identity-provider';
import { CognitoJwtVerifier } from 'aws-jwt-verify';

/** Quem está logado: o `sub` do Cognito e o `sub` da conta Google (identidade estável, independe do e-mail). */
export interface GoogleIdentity {
  cognitoSub: string;
  googleSub: string;
}

export class GoogleOnlyError extends Error {
  override name = 'GoogleOnlyError';
}

export interface Verifier {
  verify(accessToken: string): Promise<GoogleIdentity>;
}

export interface ProfileLookup {
  profile(accessToken: string): Promise<{ email: string; name: string | null }>;
}

/** Usuário federado do Cognito chama `google_<sub do Google>`; login por senha não serve na landing. */
export const identityOf = ({ sub, username }: { sub: string; username: string }): GoogleIdentity => {
  const match = /^google_(.+)$/i.exec(username);
  if (!match?.[1]) throw new GoogleOnlyError('A landing só aceita login pelo Google');
  return { cognitoSub: sub, googleSub: match[1] };
};

/** Confere assinatura, emissor, cliente da landing, uso (`access`) e validade; chaves públicas em cache. */
export class CognitoGoogleVerifier implements Verifier {
  private readonly verifier;

  constructor(userPoolId: string, clientId: string) {
    this.verifier = CognitoJwtVerifier.create({ userPoolId, clientId, tokenUse: 'access' });
  }

  async verify(accessToken: string): Promise<GoogleIdentity> {
    const payload = await this.verifier.verify(accessToken);
    return identityOf({ sub: payload.sub, username: payload.username });
  }
}

/** Nome e e-mail verificado vindos do Google (atributos do usuário no Cognito). */
export class CognitoProfileLookup implements ProfileLookup {
  constructor(private readonly client: CognitoIdentityProviderClient) {}

  async profile(accessToken: string): Promise<{ email: string; name: string | null }> {
    const { UserAttributes = [] } = await this.client.send(new GetUserCommand({ AccessToken: accessToken }));
    const attr = (name: string) => UserAttributes.find((a) => a.Name === name)?.Value;
    const email = attr('email');
    if (!email || attr('email_verified') !== 'true') throw new Error('Conta Google sem e-mail verificado');
    return { email: email.trim().toLowerCase(), name: attr('name')?.trim() || null };
  }
}
