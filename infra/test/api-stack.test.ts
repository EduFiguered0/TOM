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

  it('IAM mínimo: logs só no próprio grupo; na tabela, só Get, Put e Delete', () => {
    template.resourceCountIs('AWS::IAM::Policy', 1);
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: [
          { Action: ['logs:CreateLogStream', 'logs:PutLogEvents'], Effect: 'Allow', Resource: { 'Fn::GetAtt': [Match.anyValue(), 'Arn'] } },
          { Action: ['dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:DeleteItem'], Effect: 'Allow', Resource: Match.anyValue() },
        ],
      },
    });
    template.hasResourceProperties('AWS::IAM::Role', { ManagedPolicyArns: Match.absent() });
  });

  it('referências entre stacks são fracas (sem exports travando deploys)', () => {
    const json = JSON.stringify(template.toJSON());
    expect(json).toContain('Fn::GetStackOutput');
    expect(json).not.toContain('Fn::ImportValue');
  });
});
