import { CognitoIdentityProviderClient, GetUserCommand } from '@aws-sdk/client-cognito-identity-provider';
import type { Identity } from '@tom/core';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import type { EmailLookup, TokenVerifier } from './api.js';

/** Confere assinatura, emissor, cliente, uso (`access`) e validade do token; as chaves públicas ficam em cache. */
export class CognitoTokenVerifier implements TokenVerifier {
  private readonly verifier;

  constructor(userPoolId: string, clientId: string) {
    this.verifier = CognitoJwtVerifier.create({ userPoolId, clientId, tokenUse: 'access' });
  }

  async verify(accessToken: string): Promise<Identity> {
    const payload = await this.verifier.verify(accessToken);
    const session = payload['origin_jti'];
    if (typeof session !== 'string') throw new Error('Token sem origin_jti (revogação desligada no cliente?)');
    return { login: payload.sub, session, groups: payload['cognito:groups'] ?? [] };
  }
}

export class CognitoEmailLookup implements EmailLookup {
  constructor(private readonly client: CognitoIdentityProviderClient) {}

  async verifiedEmail(accessToken: string): Promise<string> {
    const { UserAttributes = [] } = await this.client.send(new GetUserCommand({ AccessToken: accessToken }));
    const attr = (name: string) => UserAttributes.find((a) => a.Name === name)?.Value;
    const email = attr('email');
    if (!email || attr('email_verified') !== 'true') throw new Error('Conta sem e-mail verificado');
    return email;
  }
}
