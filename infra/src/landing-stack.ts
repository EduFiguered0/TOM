import { CfnOutput, Duration, RemovalPolicy, Stack, Validations, type StackProps } from 'aws-cdk-lib';
import {
  AllowedMethods, CacheCookieBehavior, CacheHeaderBehavior, CachePolicy, CacheQueryStringBehavior, Distribution, Function as CloudFrontFunction,
  FunctionCode, FunctionEventType, FunctionRuntime, HeadersFrameOption, HeadersReferrerPolicy, HttpVersion, OriginRequestPolicy, PriceClass,
  ResponseHeadersPolicy, S3OriginAccessControl, ViewerProtocolPolicy,
} from 'aws-cdk-lib/aws-cloudfront';
import { FunctionUrlOrigin, S3BucketOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { OAuthScope, UserPoolClient, UserPoolClientIdentityProvider, type IUserPool } from 'aws-cdk-lib/aws-cognito';
import { AttributeType, BillingMode, Table } from 'aws-cdk-lib/aws-dynamodb';
import { PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { Architecture, FunctionUrlAuthType, Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { BlockPublicAccess, Bucket, BucketEncryption, type IBucket } from 'aws-cdk-lib/aws-s3';
import type { Construct } from 'constructs';
import { fileURLToPath } from 'node:url';
import { nameDefaultPolicy, nameOf } from './names.js';

export interface LandingStackProps extends StackProps {
  /** Pool de produção (o Google já está configurado nele); a landing ganha um cliente de app próprio. */
  userPool: IUserPool;
  /** Domínio de login do Cognito (troca do código do Google pelo token). */
  loginDomain: string;
  /**
   * Endereços de volta do login. Vêm da configuração (cdk.json) e não da distribuição, para não criar ciclo
   * (distribuição → URL da função → id do cliente → cliente → distribuição). Ver docs/landing-goodgame.md.
   */
  callbackUrls: string[];
}

const HANDLER = fileURLToPath(new URL('../../apps/landing-api/src/handler.ts', import.meta.url));
const STAGE = 'prod';
const gg = (resource: string) => nameOf(STAGE, `gg-${resource}`);

/**
 * Landing de ingressos da GoodGame, isolada do TOM: tabela, API, cliente de login, site e CloudFront próprios.
 * Custo: on-demand e franquias gratuitas (Lambda, CloudFront); sem API Gateway nem WAF.
 */
export class LandingStack extends Stack {
  constructor(scope: Construct, id: string, { userPool, loginDomain, callbackUrls, ...props }: LandingStackProps) {
    super(scope, id, { terminationProtection: true, ...props });

    // Leads, travas do Google, consentimentos e intenções; TTL de 6 meses gravado pela API (LGPD).
    const table = new Table(this, 'Leads', {
      tableName: gg('leads'),
      partitionKey: { name: 'pk', type: AttributeType.STRING },
      sortKey: { name: 'sk', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'expiresAt',
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      deletionProtection: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const client = new UserPoolClient(this, 'Client', {
      userPool,
      userPoolClientName: gg('site'),
      generateSecret: false,
      authFlows: { user: false, userPassword: false, adminUserPassword: false, custom: false, userSrp: false },
      accessTokenValidity: Duration.minutes(60),
      idTokenValidity: Duration.minutes(60),
      refreshTokenValidity: Duration.days(30),
      enableTokenRevocation: true,
      preventUserExistenceErrors: true,
      supportedIdentityProviders: [UserPoolClientIdentityProvider.custom('Google')],
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [OAuthScope.OPENID, OAuthScope.EMAIL, OAuthScope.PROFILE, OAuthScope.COGNITO_ADMIN],
        callbackUrls,
        logoutUrls: callbackUrls,
      },
    });

    const functionName = gg('landing-api');
    const logGroup = new LogGroup(this, 'Logs', {
      logGroupName: `/aws/lambda/${functionName}`, retention: RetentionDays.TWO_WEEKS, removalPolicy: RemovalPolicy.DESTROY,
    });
    const role = new Role(this, 'Role', { roleName: gg('landing-api-role'), assumedBy: new ServicePrincipal('lambda.amazonaws.com') });
    role.addToPolicy(new PolicyStatement({ actions: ['logs:CreateLogStream', 'logs:PutLogEvents'], resources: [logGroup.logGroupArn] }));
    const fn = new NodejsFunction(this, 'Handler', {
      functionName,
      entry: HANDLER,
      handler: 'handler',
      runtime: Runtime.NODEJS_22_X,
      architecture: Architecture.ARM_64,
      memorySize: 256,
      timeout: Duration.seconds(10),
      // Limite contra abuso (sem WAF): picos além disso recebem 429.
      reservedConcurrentExecutions: 10,
      role,
      logGroup,
      environment: { LEADS_TABLE: table.tableName, USER_POOL_ID: userPool.userPoolId, USER_POOL_CLIENT_ID: client.userPoolClientId },
      bundling: { minify: true, sourceMap: true, esbuildArgs: { '--conditions': 'source' } },
    });
    // Só o que o DynamoLeadRepository usa (transações exigem a permissão de cada item).
    table.grant(fn, 'dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:Query', 'dynamodb:ConditionCheckItem');
    nameDefaultPolicy(role, gg('landing-api-policy'));
    const fnUrl = fn.addFunctionUrl({ authType: FunctionUrlAuthType.NONE });

    const site = new Bucket(this, 'Site', {
      bucketName: gg(`site-${this.account}`),
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const headers = new ResponseHeadersPolicy(this, 'Security', {
      responseHeadersPolicyName: gg('security-headers'),
      securityHeadersBehavior: {
        contentSecurityPolicy: {
          override: true,
          contentSecurityPolicy: [
            "default-src 'self'",
            "script-src 'self'",
            "style-src 'self'",
            "img-src 'self' data:",
            `connect-src 'self' https://cognito-idp.${this.region}.amazonaws.com ${loginDomain}`,
            "object-src 'none'",
            "base-uri 'self'",
            `form-action 'self' ${loginDomain}`,
            "frame-ancestors 'none'",
          ].join('; '),
        },
        strictTransportSecurity: { override: true, accessControlMaxAge: Duration.days(365), includeSubdomains: true },
        frameOptions: { override: true, frameOption: HeadersFrameOption.DENY },
        contentTypeOptions: { override: true },
        referrerPolicy: { override: true, referrerPolicy: HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN },
      },
    });

    // Authorization e a query (UTM) chegam à API; ela responde no-store, exceto /events (60 s).
    const apiCache = new CachePolicy(this, 'ApiCache', {
      cachePolicyName: gg('api-cache'),
      minTtl: Duration.seconds(0),
      defaultTtl: Duration.seconds(0),
      maxTtl: Duration.seconds(60),
      headerBehavior: CacheHeaderBehavior.allowList('Authorization'),
      queryStringBehavior: CacheQueryStringBehavior.all(),
      cookieBehavior: CacheCookieBehavior.none(),
    });

    const spaRoutes = new CloudFrontFunction(this, 'SpaRoutes', {
      functionName: gg('spa-routes'),
      runtime: FunctionRuntime.JS_2_0,
      code: FunctionCode.fromInline(
        "function handler(event) { var r = event.request; if (r.uri.indexOf('.') === -1) { r.uri = '/index.html'; } return r; }",
      ),
    });
    const originAccessControl = new S3OriginAccessControl(this, 'SiteAccess', { originAccessControlName: gg('site-oac') });

    const distribution = new Distribution(this, 'Cdn', {
      comment: gg('site'),
      defaultRootObject: 'index.html',
      httpVersion: HttpVersion.HTTP2_AND_3,
      priceClass: PriceClass.PRICE_CLASS_ALL,
      defaultBehavior: {
        origin: S3BucketOrigin.withOriginAccessControl(site as IBucket, { originAccessControl }),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        responseHeadersPolicy: headers,
        compress: true,
        functionAssociations: [{ function: spaRoutes, eventType: FunctionEventType.VIEWER_REQUEST }],
      },
      additionalBehaviors: {
        '/api/*': {
          origin: new FunctionUrlOrigin(fnUrl),
          viewerProtocolPolicy: ViewerProtocolPolicy.HTTPS_ONLY,
          allowedMethods: AllowedMethods.ALLOW_ALL,
          cachePolicy: apiCache,
          originRequestPolicy: OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
          responseHeadersPolicy: headers,
        },
      },
    });

    Validations.of(fn).acknowledge({
      id: 'AwsSolutions-L1',
      reason: 'Node 22 acompanha a versão usada no desenvolvimento e nos testes; a migração para Node 24 é feita junto.',
    });
    Validations.of(site).acknowledge(
      { id: 'AwsSolutions-S1', reason: 'Bucket privado, só lido pelo CloudFront; conteúdo recriado a cada deploy.' },
    );
    Validations.of(distribution).acknowledge(
      { id: 'AwsSolutions-CFR1', reason: 'Divulgação por anúncio: sem restrição geográfica.' },
      { id: 'AwsSolutions-CFR2', reason: 'WAF custa a partir de US$ 5/mês + US$ 1 por regra; fora do orçamento de custo zero. A concorrência reservada da Lambda limita abuso.' },
      { id: 'AwsSolutions-CFR3', reason: 'Logs de acesso do CloudFront gerariam armazenamento recorrente; a API já registra erros.' },
      { id: 'AwsSolutions-CFR4', reason: 'Domínio padrão *.cloudfront.net não permite escolher a versão mínima de TLS; muda com domínio próprio.' },
    );

    new CfnOutput(this, 'SiteUrl', { value: `https://${distribution.distributionDomainName}` });
    new CfnOutput(this, 'SiteBucket', { value: site.bucketName });
    new CfnOutput(this, 'DistributionId', { value: distribution.distributionId });
    new CfnOutput(this, 'UserPoolClientId', { value: client.userPoolClientId });
    new CfnOutput(this, 'LoginDomain', { value: loginDomain });
  }
}
