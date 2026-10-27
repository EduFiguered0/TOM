import { CfnOutput, Duration, RemovalPolicy, Stack, Validations, type StackProps } from 'aws-cdk-lib';
import {
  AllowedMethods,
  CacheCookieBehavior,
  CacheHeaderBehavior,
  CachePolicy,
  CacheQueryStringBehavior,
  Distribution,
  Function as CloudFrontFunction,
  FunctionCode,
  FunctionEventType,
  FunctionRuntime,
  HeadersFrameOption,
  HeadersReferrerPolicy,
  HttpVersion,
  OriginRequestPolicy,
  PriceClass,
  ResponseHeadersPolicy,
  S3OriginAccessControl,
  ViewerProtocolPolicy,
} from 'aws-cdk-lib/aws-cloudfront';
import { FunctionUrlOrigin, S3BucketOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import type { FunctionUrl } from 'aws-cdk-lib/aws-lambda';
import { BlockPublicAccess, Bucket, BucketEncryption, type IBucket } from 'aws-cdk-lib/aws-s3';
import type { Construct } from 'constructs';
import { nameOf, type Stage } from './names.js';

export interface WebStackProps extends StackProps {
  stage: Stage;
  api: FunctionUrl;
  region: string;
  /** Domínio de login do Cognito: o site troca nele o código do Google pelo token. */
  loginDomain: string;
}

/**
 * Site estático (S3 privado) atrás do CloudFront, com a API em /api no mesmo endereço: sem CORS.
 * CloudFront: 1 TB e 10 milhões de requisições/mês grátis, permanentemente.
 */
export class WebStack extends Stack {
  constructor(scope: Construct, id: string, { stage, api, region, loginDomain, ...props }: WebStackProps) {
    super(scope, id, props);

    const site = new Bucket(this, 'Site', {
      bucketName: nameOf(stage, `site-${this.account}`),
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      // O site é recriado a cada deploy a partir do código; nada a preservar.
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // Só o próprio site roda scripts; chamadas só para a API (mesmo endereço) e o Cognito. Protege o token guardado no navegador.
    const headers = new ResponseHeadersPolicy(this, 'Security', {
      responseHeadersPolicyName: nameOf(stage, 'security-headers'),
      securityHeadersBehavior: {
        contentSecurityPolicy: {
          override: true,
          contentSecurityPolicy: [
            "default-src 'self'",
            "script-src 'self'",
            "style-src 'self'",
            "img-src 'self' data:",
            `connect-src 'self' https://cognito-idp.${region}.amazonaws.com ${loginDomain}`,
            "object-src 'none'",
            "base-uri 'self'",
            "form-action 'self'",
            "frame-ancestors 'none'",
          ].join('; '),
        },
        strictTransportSecurity: { override: true, accessControlMaxAge: Duration.days(365), includeSubdomains: true },
        frameOptions: { override: true, frameOption: HeadersFrameOption.DENY },
        contentTypeOptions: { override: true },
        referrerPolicy: { override: true, referrerPolicy: HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN },
      },
    });

    // O CloudFront só repassa o Authorization em GET se ele fizer parte da chave de cache.
    // A API responde no-store: nada é guardado, e a chave por token isola os usuários.
    const apiCache = new CachePolicy(this, 'ApiCache', {
      cachePolicyName: nameOf(stage, 'api-cache'),
      minTtl: Duration.seconds(0),
      defaultTtl: Duration.seconds(0),
      maxTtl: Duration.seconds(1),
      headerBehavior: CacheHeaderBehavior.allowList('Authorization'),
      queryStringBehavior: CacheQueryStringBehavior.all(),
      cookieBehavior: CacheCookieBehavior.none(),
    });

    const apiOrigin = new FunctionUrlOrigin(api);

    // Rotas do app (ex.: /tv, /painel) servem o index.html. Só no site: uma regra de erro do CloudFront
    // valeria também para a API e trocaria os 404/403 dela por HTML. 2 milhões de execuções/mês grátis.
    const spaRoutes = new CloudFrontFunction(this, 'SpaRoutes', {
      functionName: nameOf(stage, 'spa-routes'),
      runtime: FunctionRuntime.JS_2_0,
      code: FunctionCode.fromInline(
        "function handler(event) { var r = event.request; if (r.uri.indexOf('.') === -1) { r.uri = '/index.html'; } return r; }",
      ),
    });

    const originAccessControl = new S3OriginAccessControl(this, 'SiteAccess', { originAccessControlName: nameOf(stage, 'site-oac') });

    const distribution = new Distribution(this, 'Cdn', {
      comment: nameOf(stage, 'site'),
      defaultRootObject: 'index.html',
      httpVersion: HttpVersion.HTTP2_AND_3,
      // Todas as bordas, inclusive São Paulo: menos latência no 4G do salão. Volume mínimo, coberto pela franquia.
      priceClass: PriceClass.PRICE_CLASS_ALL,
      defaultBehavior: {
        // Conversão só de tipo: a declaração do CDK conflita com exactOptionalPropertyTypes.
        origin: S3BucketOrigin.withOriginAccessControl(site as IBucket, { originAccessControl }),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        responseHeadersPolicy: headers,
        compress: true,
        functionAssociations: [{ function: spaRoutes, eventType: FunctionEventType.VIEWER_REQUEST }],
      },
      additionalBehaviors: {
        // O quadro da TV também passa aqui: é do ADM (precisa do Authorization) e não é guardado.
        '/api/*': {
          origin: apiOrigin,
          viewerProtocolPolicy: ViewerProtocolPolicy.HTTPS_ONLY,
          allowedMethods: AllowedMethods.ALLOW_ALL,
          cachePolicy: apiCache,
          originRequestPolicy: OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
          responseHeadersPolicy: headers,
        },
      },
    });

    Validations.of(site).acknowledge(
      { id: 'AwsSolutions-S1', reason: 'Bucket privado, só lido pelo CloudFront; conteúdo recriado a cada deploy.' },
    );
    Validations.of(distribution).acknowledge(
      { id: 'AwsSolutions-CFR1', reason: 'Público é local, mas jogadores consultam histórico de qualquer lugar; sem restrição geográfica.' },
      { id: 'AwsSolutions-CFR2', reason: 'WAF custa a partir de US$ 5/mês + US$ 1 por regra; fora do orçamento de custo zero. A cota de concorrência da Lambda limita abuso.' },
      { id: 'AwsSolutions-CFR3', reason: 'Logs de acesso do CloudFront gerariam armazenamento recorrente; a API já registra erros.' },
      { id: 'AwsSolutions-CFR4', reason: 'Domínio padrão *.cloudfront.net não permite escolher a versão mínima de TLS; muda com domínio próprio.' },
    );

    new CfnOutput(this, 'SiteUrl', { value: `https://${distribution.distributionDomainName}` });
    new CfnOutput(this, 'SiteBucket', { value: site.bucketName });
    new CfnOutput(this, 'DistributionId', { value: distribution.distributionId });
  }
}
