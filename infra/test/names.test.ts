import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/build-app.js';

const built = buildApp('123456789012', new App({ outdir: mkdtempSync(join(tmpdir(), 'cdk-')) }));
// Sintetiza uma vez, fora dos testes: o bundle da Lambda passa do tempo limite de um teste.
const templates = Object.fromEntries(
  (['data', 'test', 'auth', 'authTest', 'api', 'apiTest', 'web'] as const).map((k) => [k, Template.fromStack(built[k])]),
);
const t = (stack: string) => templates[stack] as Template;

/** Nomes legíveis no console: tom-<ambiente>-<recurso>, sem sufixos gerados. */
describe('nomes dos recursos', () => {
  it('stacks por ambiente; a TomWeb fica (recriar trocaria o endereço do CloudFront)', () => {
    const { data, test, auth, authTest, api, apiTest, web } = built;
    expect([data, auth, api].map((s) => s.stackName)).toEqual(['tom-prod-data', 'tom-prod-auth', 'tom-prod-api']);
    expect([test, authTest, apiTest].map((s) => s.stackName)).toEqual(['tom-test-data', 'tom-test-auth', 'tom-test-api']);
    expect(web.stackName).toBe('TomWeb');
  });

  it.each([['data', 'prod'], ['test', 'test']] as const)('dados (%s): tabelas e bucket de fotografias', (stack, stage) => {
    for (const table of ['accounts', 'events', 'tournaments']) {
      t(stack).hasResourceProperties('AWS::DynamoDB::Table', { TableName: `tom-${stage}-${table}` });
    }
    t(stack).hasResourceProperties('AWS::S3::Bucket', { BucketName: `tom-${stage}-snapshots-123456789012` });
  });

  it.each([['api', 'prod'], ['apiTest', 'test']] as const)('API (%s): função, role, policy e logs', (stack, stage) => {
    t(stack).hasResourceProperties('AWS::Lambda::Function', { FunctionName: `tom-${stage}-api` });
    t(stack).hasResourceProperties('AWS::IAM::Role', { RoleName: `tom-${stage}-api-role` });
    t(stack).hasResourceProperties('AWS::IAM::Policy', { PolicyName: `tom-${stage}-api-policy` });
    t(stack).hasResourceProperties('AWS::Logs::LogGroup', { LogGroupName: `/aws/lambda/tom-${stage}-api` });
  });

  it.each([['auth', 'prod'], ['authTest', 'test']] as const)('login (%s): pool, app e gatilho', (stack, stage) => {
    t(stack).hasResourceProperties('AWS::Cognito::UserPool', { UserPoolName: `tom-${stage}-users` });
    t(stack).hasResourceProperties('AWS::Cognito::UserPoolClient', { ClientName: `tom-${stage}-site` });
    t(stack).hasResourceProperties('AWS::Lambda::Function', { FunctionName: `tom-${stage}-pre-signup` });
    t(stack).hasResourceProperties('AWS::IAM::Role', { RoleName: `tom-${stage}-pre-signup-role` });
    t(stack).hasResourceProperties('AWS::IAM::Policy', { PolicyName: `tom-${stage}-pre-signup-policy` });
    t(stack).hasResourceProperties('AWS::Logs::LogGroup', { LogGroupName: `/aws/lambda/tom-${stage}-pre-signup` });
  });

  it('site: bucket, itens do CloudFront e descrição da distribuição', () => {
    const web = t('web');
    web.hasResourceProperties('AWS::S3::Bucket', { BucketName: 'tom-prod-site-123456789012' });
    web.hasResourceProperties('AWS::CloudFront::ResponseHeadersPolicy', { ResponseHeadersPolicyConfig: { Name: 'tom-prod-security-headers' } });
    web.hasResourceProperties('AWS::CloudFront::CachePolicy', { CachePolicyConfig: { Name: 'tom-prod-api-cache' } });
    web.hasResourceProperties('AWS::CloudFront::Function', { Name: 'tom-prod-spa-routes' });
    web.hasResourceProperties('AWS::CloudFront::OriginAccessControl', { OriginAccessControlConfig: { Name: 'tom-prod-site-oac' } });
    web.hasResourceProperties('AWS::CloudFront::Distribution', { DistributionConfig: { Comment: 'tom-prod-site' } });
  });
});
