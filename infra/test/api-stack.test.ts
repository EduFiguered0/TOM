import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildApp, REGION } from '../src/build-app.js';

const { api } = buildApp('123456789012', new App({ outdir: mkdtempSync(join(tmpdir(), 'cdk-')) }));
const template = Template.fromStack(api);

describe('ApiStack', () => {
  it('fica na região do projeto e não usa API Gateway', () => {
    expect(api.region).toBe(REGION);
    expect(Object.keys(template.findResources('AWS::ApiGatewayV2::Api'))).toHaveLength(0);
    expect(Object.keys(template.findResources('AWS::ApiGateway::RestApi'))).toHaveLength(0);
  });

  it('Lambda Node 22 em Arm, 256 MB, com a configuração do Cognito e da tabela', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      Runtime: 'nodejs22.x',
      Architectures: ['arm64'],
      MemorySize: 256,
      Environment: { Variables: { ACCOUNTS_TABLE: Match.anyValue(), USER_POOL_ID: Match.anyValue(), USER_POOL_CLIENT_ID: Match.anyValue() } },
    });
  });

  it('Function URL pública (o token é validado no código)', () => {
    template.hasResourceProperties('AWS::Lambda::Url', { AuthType: 'NONE' });
  });

  it('logs guardados por 14 dias', () => {
    template.hasResourceProperties('AWS::Logs::LogGroup', { RetentionInDays: 14 });
  });

  it('IAM mínimo: logs só no próprio grupo; em cada tabela e no bucket, só as ações usadas, sem curingas de ação', () => {
    template.resourceCountIs('AWS::IAM::Policy', 1);
    const policy = Object.values(template.findResources('AWS::IAM::Policy'))[0] as { Properties: { PolicyDocument: { Statement: { Action: string | string[]; Resource: unknown }[] } } };
    const statements = policy.Properties.PolicyDocument.Statement.map((s) => [s.Action].flat().sort());
    expect(statements).toEqual([
      ['logs:CreateLogStream', 'logs:PutLogEvents'],
      ['dynamodb:DeleteItem', 'dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:Scan'],
      ['dynamodb:ConditionCheckItem', 'dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:Query'],
      ['dynamodb:ConditionCheckItem', 'dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:Query'],
      ['s3:GetObject', 's3:PutObject'],
      ['s3:ListBucket'],
    ]);
    expect(statements.flat().some((a) => a.includes('*'))).toBe(false);
    expect(policy.Properties.PolicyDocument.Statement.slice(-2).map((s) => s.Resource)).toEqual([
      'arn:aws:s3:::tom-prod-snapshots-123456789012/*',
      'arn:aws:s3:::tom-prod-snapshots-123456789012',
    ]);
    template.hasResourceProperties('AWS::IAM::Role', { ManagedPolicyArns: Match.absent() });
  });

  it('referências entre stacks são fracas (sem exports travando deploys)', () => {
    const json = JSON.stringify(template.toJSON());
    expect(json).toContain('Fn::GetStackOutput');
    expect(json).not.toContain('Fn::ImportValue');
  });
});
