import { CfnOutput, Duration, RemovalPolicy, Stack, Validations, type StackProps } from 'aws-cdk-lib';
import type { UserPool, UserPoolClient } from 'aws-cdk-lib/aws-cognito';
import type { Table } from 'aws-cdk-lib/aws-dynamodb';
import { PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { Architecture, FunctionUrlAuthType, HttpMethod, Runtime, type FunctionUrl } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import type { Construct } from 'constructs';
import { fileURLToPath } from 'node:url';

export interface ApiStackProps extends StackProps {
  ephemeral: boolean;
  accounts: Table;
  events: Table;
  tournaments: Table;
  /** Nome do bucket de fotografias (fixo; ver DataStack). */
  snapshotsBucket: string;
  userPool: UserPool;
  client: UserPoolClient;
}

const HANDLER = fileURLToPath(new URL('../../apps/api/src/handler.ts', import.meta.url));

/**
 * API: uma Lambda atrás de Function URL (sem API Gateway: só paga a execução da Lambda).
 * O token é validado no código; a sessão ativa é conferida no DynamoDB a cada chamada.
 */
export class ApiStack extends Stack {
  readonly functionUrl: FunctionUrl;

  constructor(scope: Construct, id: string, { ephemeral, accounts, events, tournaments, snapshotsBucket, userPool, client, ...props }: ApiStackProps) {
    super(scope, id, props);

    const logGroup = new LogGroup(this, 'Logs', {
      retention: RetentionDays.TWO_WEEKS,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // Role própria: logs só no grupo desta função, em vez da política gerenciada que libera todos os grupos.
    const role = new Role(this, 'Role', { assumedBy: new ServicePrincipal('lambda.amazonaws.com') });
    role.addToPolicy(new PolicyStatement({
      actions: ['logs:CreateLogStream', 'logs:PutLogEvents'],
      resources: [logGroup.logGroupArn],
    }));

    const fn = new NodejsFunction(this, 'Handler', {
      entry: HANDLER,
      handler: 'handler',
      runtime: Runtime.NODEJS_22_X,
      architecture: Architecture.ARM_64,
      memorySize: 256,
      timeout: Duration.seconds(10),
      role,
      logGroup,
      environment: {
        ACCOUNTS_TABLE: accounts.tableName,
        EVENTS_TABLE: events.tableName,
        TOURNAMENTS_TABLE: tournaments.tableName,
        SNAPSHOTS_BUCKET: snapshotsBucket,
        USER_POOL_ID: userPool.userPoolId,
        USER_POOL_CLIENT_ID: client.userPoolClientId,
        // Testes não guardam contas por 24 meses.
        ...(ephemeral ? { RETENTION_DAYS: '1' } : {}),
      },
      bundling: {
        minify: true,
        sourceMap: true,
        // Os pacotes @tom/* expõem o código-fonte pela condição "source".
        esbuildArgs: { '--conditions': 'source' },
      },
    });
    // Só o que o DynamoAccountRepository usa (a transação exige a permissão de cada item: Put e Delete).
    // Scan: busca da Equipe (poucas centenas de contas).
    accounts.grant(fn, 'dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:DeleteItem', 'dynamodb:Scan');
    // DynamoEventStore: lê o stream (Query) e grava em transação (Put + ConditionCheck).
    events.grant(fn, 'dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:Query', 'dynamodb:ConditionCheckItem');
    // Registro de eventos e inscrições: Query lista as inscrições; ConditionCheck é a guarda do QR (evento ainda aberto).
    tournaments.grant(fn, 'dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:Query', 'dynamodb:ConditionCheckItem');
    // S3SnapshotStore: grava, lê e lista versões; nunca apaga. Explícito: os grant* do CDK liberam curingas (s3:GetObject*, s3:List*).
    const bucketArn = `arn:aws:s3:::${snapshotsBucket}`;
    role.addToPolicy(new PolicyStatement({ actions: ['s3:PutObject', 's3:GetObject'], resources: [`${bucketArn}/*`] }));
    role.addToPolicy(new PolicyStatement({ actions: ['s3:ListBucket'], resources: [bucketArn] }));

    const fnUrl = fn.addFunctionUrl({
      authType: FunctionUrlAuthType.NONE,
      // Até o site ir para o CloudFront (fase 7), qualquer origem; o token Bearer é a proteção.
      cors: { allowedOrigins: ['*'], allowedMethods: [HttpMethod.GET, HttpMethod.POST], allowedHeaders: ['authorization', 'content-type'] },
    });
    this.functionUrl = fnUrl;

    Validations.of(role).acknowledge({
      id: `AwsSolutions-IAM5[Resource::${bucketArn}/*]`,
      reason: 'Objetos do bucket de fotografias: a chave de cada HTML é criada no envio; só PutObject e GetObject.',
    });
    Validations.of(fn).acknowledge({
      id: 'AwsSolutions-L1',
      reason: 'Node 22 acompanha a versão usada no desenvolvimento e nos testes; a migração para Node 24 é feita junto.',
    });

    new CfnOutput(this, 'ApiUrl', { value: fnUrl.url });
    if (ephemeral) new CfnOutput(this, 'ApiFunctionName', { value: fn.functionName });
  }
}
