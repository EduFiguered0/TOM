import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildApp, REGION } from '../src/build-app.js';

const newApp = () => new App({ outdir: mkdtempSync(join(tmpdir(), 'cdk-')) });
const { data, test } = buildApp('123456789012', newApp());
const prod = Template.fromStack(data);
const temp = Template.fromStack(test);

describe('DataStack', () => {
  it('fica na região do projeto', () => {
    expect([data.region, test.region]).toEqual([REGION, REGION]);
  });

  it('tabela de eventos: stream + versão, sob demanda, com TTL da LGPD', () => {
    prod.hasResourceProperties('AWS::DynamoDB::Table', {
      KeySchema: [{ AttributeName: 'pk', KeyType: 'HASH' }, { AttributeName: 'sk', KeyType: 'RANGE' }],
      AttributeDefinitions: [{ AttributeName: 'pk', AttributeType: 'S' }, { AttributeName: 'sk', AttributeType: 'N' }],
      BillingMode: 'PAY_PER_REQUEST',
      TimeToLiveSpecification: { AttributeName: 'expiresAt', Enabled: true },
    });
  });

  it('tabela de contas: chave genérica (conta, auditoria e trava do Player ID), sob demanda, com TTL', () => {
    prod.resourceCountIs('AWS::DynamoDB::Table', 2);
    prod.hasResourceProperties('AWS::DynamoDB::Table', {
      AttributeDefinitions: [{ AttributeName: 'pk', AttributeType: 'S' }, { AttributeName: 'sk', AttributeType: 'S' }],
      BillingMode: 'PAY_PER_REQUEST',
      TimeToLiveSpecification: { AttributeName: 'expiresAt', Enabled: true },
    });
  });

  it('bucket privado, criptografado, só HTTPS', () => {
    prod.hasResourceProperties('AWS::S3::Bucket', {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true, BlockPublicPolicy: true, IgnorePublicAcls: true, RestrictPublicBuckets: true,
      },
      BucketEncryption: { ServerSideEncryptionConfiguration: [{ ServerSideEncryptionByDefault: { SSEAlgorithm: 'AES256' } }] },
    });
    prod.hasResourceProperties('AWS::S3::BucketPolicy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({ Effect: 'Deny', Condition: { Bool: { 'aws:SecureTransport': 'false' } } }),
        ]),
      },
    });
  });

  it('produção guarda os dados: retenção, PITR, proteção contra exclusão e 24 meses no S3', () => {
    expect(data.terminationProtection).toBe(true);
    prod.hasResource('AWS::DynamoDB::Table', {
      DeletionPolicy: 'Retain',
      Properties: Match.objectLike({
        DeletionProtectionEnabled: true,
        PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: true },
      }),
    });
    prod.hasResource('AWS::S3::Bucket', { DeletionPolicy: 'Retain' });
    prod.hasResourceProperties('AWS::S3::Bucket', {
      LifecycleConfiguration: { Rules: [Match.objectLike({ ExpirationInDays: 730 })] },
    });
  });

  it('stack de testes é descartável e não guarda nada por muito tempo', () => {
    expect(test.terminationProtection).toBe(false);
    temp.hasResource('AWS::DynamoDB::Table', { DeletionPolicy: 'Delete' });
    temp.hasResource('AWS::S3::Bucket', { DeletionPolicy: 'Delete' });
    temp.hasResourceProperties('AWS::S3::Bucket', {
      LifecycleConfiguration: { Rules: [Match.objectLike({ ExpirationInDays: 1 })] },
    });
  });

  it('não cria IAM nem Lambda nesta fase', () => {
    for (const t of [prod, temp]) {
      t.resourceCountIs('AWS::IAM::Role', 0);
      t.resourceCountIs('AWS::Lambda::Function', 0);
    }
  });

  it('passa nas regras de segurança do cdk-nag', () => {
    expect(() => buildApp('123456789012', newApp()).app.synth()).not.toThrow();
  });
});
