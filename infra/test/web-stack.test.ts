import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/build-app.js';

const { web } = buildApp('123456789012', new App({ outdir: mkdtempSync(join(tmpdir(), 'cdk-')) }));
const template = Template.fromStack(web);
const config = () => (Object.values(template.findResources('AWS::CloudFront::Distribution'))[0] as {
  Properties: { DistributionConfig: Record<string, unknown> };
}).Properties.DistributionConfig;

describe('WebStack', () => {
  it('bucket privado, lido só pelo CloudFront (OAC)', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      PublicAccessBlockConfiguration: { BlockPublicAcls: true, BlockPublicPolicy: true, IgnorePublicAcls: true, RestrictPublicBuckets: true },
    });
    template.resourceCountIs('AWS::CloudFront::OriginAccessControl', 1);
  });

  it('quadro da TV guardado pelo tempo da API, sem Authorization na chave; vem antes de /api/*', () => {
    const [board] = config()['CacheBehaviors'] as { PathPattern: string; AllowedMethods: string[] }[];
    expect(board?.PathPattern).toBe('/api/board');
    expect(board?.AllowedMethods).toEqual(['GET', 'HEAD']);
    template.hasResourceProperties('AWS::CloudFront::CachePolicy', {
      CachePolicyConfig: Match.objectLike({
        MaxTTL: 10,
        ParametersInCacheKeyAndForwardedToOrigin: Match.objectLike({ HeadersConfig: { HeaderBehavior: 'none' } }),
      }),
    });
  });

  it('API em /api no mesmo endereço, sem cache e com o Authorization repassado', () => {
    const [, api] = config()['CacheBehaviors'] as { PathPattern: string; AllowedMethods: string[] }[];
    expect(api?.PathPattern).toBe('/api/*');
    expect(api?.AllowedMethods).toContain('POST');
    template.hasResourceProperties('AWS::CloudFront::CachePolicy', {
      CachePolicyConfig: Match.objectLike({
        DefaultTTL: 0,
        ParametersInCacheKeyAndForwardedToOrigin: Match.objectLike({ HeadersConfig: { HeaderBehavior: 'whitelist', Headers: ['Authorization'] } }),
      }),
    });
  });

  it('rotas do app servem o index.html só no site; a API mantém os próprios 404/403; só HTTPS', () => {
    expect(config()['CustomErrorResponses']).toBeUndefined();
    const site = config()['DefaultCacheBehavior'] as { FunctionAssociations?: { EventType: string }[] };
    expect(site.FunctionAssociations).toEqual([expect.objectContaining({ EventType: 'viewer-request' })]);
    for (const behavior of config()['CacheBehaviors'] as { FunctionAssociations?: unknown }[]) expect(behavior.FunctionAssociations).toBeUndefined();
    expect((config()['DefaultCacheBehavior'] as Record<string, unknown>)['ViewerProtocolPolicy']).toBe('redirect-to-https');
  });

  it('CSP rígida protege o token guardado no navegador', () => {
    template.hasResourceProperties('AWS::CloudFront::ResponseHeadersPolicy', {
      ResponseHeadersPolicyConfig: {
        SecurityHeadersConfig: Match.objectLike({
          ContentSecurityPolicy: {
            Override: true,
            ContentSecurityPolicy: Match.stringLikeRegexp("script-src 'self'.*connect-src 'self' https://cognito-idp\\.us-east-2\\.amazonaws\\.com https://tom-pokemon-login\\.auth\\.us-east-2\\.amazoncognito\\.com.*frame-ancestors 'none'"),
          },
        }),
      },
    });
  });

  it('nenhuma Lambda nem role IAM', () => {
    template.resourceCountIs('AWS::Lambda::Function', 0);
    template.resourceCountIs('AWS::IAM::Role', 0);
  });
});
