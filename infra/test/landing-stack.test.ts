import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildApp, REGION } from '../src/build-app.js';

const { app, landing } = buildApp('123456789012', new App({ outdir: mkdtempSync(join(tmpdir(), 'cdk-')), context: { landingCallbackUrls: ['http://localhost:5174/'] } }));
const template = Template.fromStack(landing);

describe('LandingStack', () => {
  it('fica na região do projeto com o nome tom-prod-gg-landing', () => {
    expect(landing.region).toBe(REGION);
    expect(landing.stackName).toBe('tom-prod-gg-landing');
  });

  it('tabela de leads com TTL de expiração, PITR e proteção contra exclusão', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      TableName: 'tom-prod-gg-leads',
      TimeToLiveSpecification: { AttributeName: 'expiresAt', Enabled: true },
      DeletionProtectionEnabled: true,
      PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: true },
    });
  });

  it('Lambda com a tabela e o cliente de login da landing, concorrência limitada', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: 'tom-prod-gg-landing-api',
      Runtime: 'nodejs22.x',
      ReservedConcurrentExecutions: 10,
      Environment: { Variables: { LEADS_TABLE: Match.anyValue(), USER_POOL_ID: Match.anyValue(), USER_POOL_CLIENT_ID: Match.anyValue() } },
    });
    template.hasResourceProperties('AWS::Lambda::Url', { AuthType: 'NONE' });
  });

  it('cliente de app próprio no pool, só Google, com o escopo profile', () => {
    template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
      ClientName: 'tom-prod-gg-site',
      SupportedIdentityProviders: ['Google'],
      AllowedOAuthScopes: Match.arrayWith(['openid', 'email', 'profile', 'aws.cognito.signin.user.admin']),
      CallbackURLs: ['http://localhost:5174/'],
      GenerateSecret: false,
    });
  });

  it('CloudFront com a API em /api/*', () => {
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({ CacheBehaviors: [Match.objectLike({ PathPattern: '/api/*' })] }),
    });
  });

  it('isolada do TOM: sem acesso às tabelas de contas, eventos e torneios', () => {
    const json = JSON.stringify(template.toJSON());
    for (const table of ['tom-prod-accounts', 'tom-prod-events', 'tom-prod-tournaments']) expect(json).not.toContain(table);
  });

  it('passa nas regras de segurança do cdk-nag', { timeout: 30_000 }, () => {
    expect(() => app.synth()).not.toThrow();
  });
});
