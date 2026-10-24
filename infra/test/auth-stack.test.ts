import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildApp, REGION } from '../src/build-app.js';

const { auth, authTest } = buildApp('123456789012', new App({ outdir: mkdtempSync(join(tmpdir(), 'cdk-')) }));
const prod = Template.fromStack(auth);
const temp = Template.fromStack(authTest);

describe('AuthStack', () => {
  it('fica na região do projeto', () => {
    expect([auth.region, authTest.region]).toEqual([REGION, REGION]);
  });

  it('login por código no e-mail, plano Essentials, e-mail como identificador', () => {
    prod.hasResourceProperties('AWS::Cognito::UserPool', {
      UserPoolTier: 'ESSENTIALS',
      UsernameAttributes: ['email'],
      AutoVerifiedAttributes: ['email'],
      MfaConfiguration: 'OFF',
      Policies: Match.objectLike({ SignInPolicy: { AllowedFirstAuthFactors: Match.arrayWith(['EMAIL_OTP']) } }),
    });
  });

  it('e-mail de verificação em português, com o código', () => {
    prod.hasResourceProperties('AWS::Cognito::UserPool', {
      VerificationMessageTemplate: Match.objectLike({
        DefaultEmailOption: 'CONFIRM_WITH_CODE',
        EmailSubject: 'Seu código de acesso - Torneios TOM',
        EmailMessage: Match.stringLikeRegexp('\\{####\\}'),
      }),
    });
  });

  it('domínio de login próprio de cada pool', () => {
    prod.hasResourceProperties('AWS::Cognito::UserPoolDomain', { Domain: 'tom-pokemon-login' });
    temp.hasResourceProperties('AWS::Cognito::UserPoolDomain', { Domain: 'tom-pokemon-login-teste' });
  });

  it('grupos de papel: admin e judge', () => {
    for (const group of ['admin', 'judge']) prod.hasResourceProperties('AWS::Cognito::UserPoolGroup', { GroupName: group });
  });

  it('cliente público, token de acesso de 15 min, revogação ligada', () => {
    prod.hasResourceProperties('AWS::Cognito::UserPoolClient', {
      GenerateSecret: false,
      AccessTokenValidity: 15,
      IdTokenValidity: 15,
      RefreshTokenValidity: 43200,
      EnableTokenRevocation: true,
      PreventUserExistenceErrors: 'ENABLED',
      ExplicitAuthFlows: Match.arrayEquals(['ALLOW_USER_AUTH', 'ALLOW_REFRESH_TOKEN_AUTH']),
    });
  });

  it('produção é retida e protegida; testes descartáveis com login de admin por senha', () => {
    expect([auth.terminationProtection, authTest.terminationProtection]).toEqual([true, false]);
    prod.hasResource('AWS::Cognito::UserPool', { DeletionPolicy: 'Retain', Properties: Match.objectLike({ DeletionProtection: 'ACTIVE' }) });
    temp.hasResource('AWS::Cognito::UserPool', { DeletionPolicy: 'Delete' });
    temp.hasResourceProperties('AWS::Cognito::UserPoolClient', {
      ExplicitAuthFlows: Match.arrayWith(['ALLOW_ADMIN_USER_PASSWORD_AUTH']),
    });
  });
});
