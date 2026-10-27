import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/build-app.js';

const { ci } = buildApp('123456789012', new App({ outdir: mkdtempSync(join(tmpdir(), 'cdk-')) }));
const template = Template.fromStack(ci);
const statements = () => JSON.stringify(template.findResources('AWS::IAM::Policy'));

describe('CiStack', () => {
  it('GitHub entra por OIDC, sem chave guardada', () => {
    template.hasResourceProperties('AWS::IAM::OIDCProvider', {
      Url: 'https://token.actions.githubusercontent.com',
      ClientIdList: ['sts.amazonaws.com'],
    });
    template.resourceCountIs('AWS::IAM::AccessKey', 0);
  });

  it('só o branch main deste repositório assume a função', () => {
    template.hasResourceProperties('AWS::IAM::Role', {
      RoleName: 'tom-github-deploy',
      AssumeRolePolicyDocument: Match.objectLike({
        Statement: [Match.objectLike({
          Action: 'sts:AssumeRoleWithWebIdentity',
          Condition: {
            StringEquals: {
              'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
              'token.actions.githubusercontent.com:sub': 'repo:EduFiguered0/TOM:ref:refs/heads/main',
            },
          },
        })],
      }),
    });
  });

  it('permissões mínimas: papéis do CDK, bucket do site, cache do CloudFront e saídas das stacks', () => {
    const json = statements();
    expect(json).toContain('cdk-hnb659fds-deploy-role-123456789012-us-east-2');
    expect(json).toContain('cdk-hnb659fds-file-publishing-role-123456789012-us-east-2');
    expect(json).toContain('arn:aws:s3:::tomweb-site');
    expect(json).toContain('cloudfront:CreateInvalidation');
    expect(json).toContain('stack/TomWeb/*');
    expect(json).toContain('stack/TomAuth/*');
    // Nada de administrador direto nem de mexer no IAM.
    expect(json).not.toMatch(/"Action":"\*"|"iam:\*"/);
  });
});
