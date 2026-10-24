import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { PRE_SIGN_UP_CODE } from '../src/auth-stack.js';
import { buildApp, REGION } from '../src/build-app.js';

const { auth, authTest } = buildApp('123456789012', new App({ outdir: mkdtempSync(join(tmpdir(), 'cdk-')) }));
const prod = Template.fromStack(auth);
const temp = Template.fromStack(authTest);
const withGoogle = buildApp('123456789012', new App({ outdir: mkdtempSync(join(tmpdir(), 'cdk-')), context: { google: true } }));
const googleProd = Template.fromStack(withGoogle.auth);
const googleTest = Template.fromStack(withGoogle.authTest);

type PreSignUp = { triggerSource: string; response: Record<string, boolean> };
/** Roda o código inline do gatilho como a Lambda rodaria (CommonJS). */
const preSignUp = (triggerSource: string): Promise<PreSignUp> => {
  const sandbox = { exports: {} as { handler?: (e: PreSignUp) => Promise<PreSignUp> } };
  runInNewContext(PRE_SIGN_UP_CODE, sandbox);
  return sandbox.exports.handler?.({ triggerSource, response: { autoConfirmUser: false, autoVerifyEmail: false } }) ?? Promise.reject(new Error('sem handler'));
};

describe('AuthStack', () => {
  it('fica na região do projeto', () => {
    expect([auth.region, authTest.region]).toEqual([REGION, REGION]);
  });

  it('e-mail alterável: o Google regrava o e-mail a cada login, e atributo fixo derruba o segundo login', () => {
    for (const stack of [prod, temp]) {
      stack.hasResourceProperties('AWS::Cognito::UserPool', {
        Schema: Match.arrayWith([Match.objectLike({ Name: 'email', Mutable: true, Required: true })]),
      });
    }
    // Atributo de pool existente não muda: o pool novo tem outro id lógico, e o antigo (produção) fica guardado.
    expect(Object.keys(prod.findResources('AWS::Cognito::UserPool'))[0]).toMatch(/^UsersV2/);
  });

  it('login por e-mail e senha (8 caracteres, letras e números), plano Essentials', () => {
    prod.hasResourceProperties('AWS::Cognito::UserPool', {
      UserPoolTier: 'ESSENTIALS',
      UsernameAttributes: ['email'],
      MfaConfiguration: 'OFF',
      Policies: Match.objectLike({
        SignInPolicy: { AllowedFirstAuthFactors: ['PASSWORD'] },
        PasswordPolicy: Match.objectLike({ MinimumLength: 8, RequireLowercase: true, RequireNumbers: true, RequireUppercase: false, RequireSymbols: false }),
      }),
    });
  });

  it('cadastro sem código: gatilho de pré-cadastro confirma e verifica o e-mail', async () => {
    prod.hasResourceProperties('AWS::Cognito::UserPool', { LambdaConfig: { PreSignUp: Match.anyValue() } });
    prod.hasResourceProperties('AWS::Lambda::Function', { Runtime: 'nodejs22.x', Architectures: ['arm64'], MemorySize: 128 });
    expect((await preSignUp('PreSignUp_SignUp')).response).toEqual({ autoConfirmUser: true, autoVerifyEmail: true });
    expect((await preSignUp('PreSignUp_ExternalProvider')).response).toEqual({ autoConfirmUser: false, autoVerifyEmail: false });
  });

  it('e-mail de "Esqueci minha senha" em português, com o código', () => {
    prod.hasResourceProperties('AWS::Cognito::UserPool', {
      VerificationMessageTemplate: Match.objectLike({
        DefaultEmailOption: 'CONFIRM_WITH_CODE',
        EmailSubject: 'Código para criar sua senha - Torneios TOM',
        EmailMessage: Match.stringLikeRegexp('\\{####\\}'),
      }),
    });
  });

  it('Google só na produção e só com a flag; escopo de admin para o GET /me ler o e-mail', () => {
    prod.hasResourceProperties('AWS::Cognito::UserPoolClient', { SupportedIdentityProviders: ['COGNITO'] });
    googleProd.hasResourceProperties('AWS::Cognito::UserPoolClient', {
      SupportedIdentityProviders: ['COGNITO', 'Google'],
      AllowedOAuthFlows: ['code'],
      AllowedOAuthScopes: Match.arrayWith(['openid', 'email', 'aws.cognito.signin.user.admin']),
      CallbackURLs: ['https://dvaep2eni3fqm.cloudfront.net/', 'http://localhost:5173/'],
    });
    googleTest.hasResourceProperties('AWS::Cognito::UserPoolClient', { AllowedOAuthFlows: Match.absent() });
    googleProd.hasOutput('GoogleEnabled', { Value: 'true' });
    prod.hasOutput('GoogleEnabled', { Value: 'false' });
  });

  it('domínio de login próprio de cada pool', () => {
    prod.hasResourceProperties('AWS::Cognito::UserPoolDomain', { Domain: 'ggtcg-login' });
    temp.hasResourceProperties('AWS::Cognito::UserPoolDomain', { Domain: 'ggtcg-login-teste' });
  });

  it('grupos de papel: admin e judge', () => {
    for (const group of ['admin', 'judge']) prod.hasResourceProperties('AWS::Cognito::UserPoolGroup', { GroupName: group });
  });

  it('cliente público, token de acesso de 15 min, revogação ligada', () => {
    prod.hasResourceProperties('AWS::Cognito::UserPoolClient', {
      GenerateSecret: false,
      AccessTokenValidity: 15,
      IdTokenValidity: 15,
      RefreshTokenValidity: 525600,
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
