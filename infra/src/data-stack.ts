import { CfnOutput, Duration, RemovalPolicy, Stack, Validations, type StackProps } from 'aws-cdk-lib';
import { AttributeType, BillingMode, Table } from 'aws-cdk-lib/aws-dynamodb';
import { BlockPublicAccess, Bucket, BucketEncryption } from 'aws-cdk-lib/aws-s3';
import type { Construct } from 'constructs';

/** LGPD: tudo expira 24 meses depois (spec, "Retenção"). */
const RETENTION = Duration.days(730);

export interface DataStackProps extends StackProps {
  /** true para a stack de testes: pode ser destruída e não guarda nada por muito tempo. */
  ephemeral: boolean;
  /** Nome fixo do bucket de fotografias: a permissão da API vira um ARN literal, sem referência entre stacks. */
  snapshotsBucketName: string;
}

/** Nome do bucket de fotografias; único no mundo por incluir a conta e a região. */
export const snapshotsBucketName = (account: string, region: string, ephemeral: boolean) =>
  `tom-snapshots${ephemeral ? '-test' : ''}-${account}-${region}`;

/** Dados do sistema: eventos das rodadas e contas (DynamoDB) e fotografias dos HTMLs do TOM (S3). */
export class DataStack extends Stack {
  readonly events: Table;
  readonly accounts: Table;
  readonly tournaments: Table;
  readonly snapshots: Bucket;

  constructor(scope: Construct, id: string, { ephemeral, snapshotsBucketName: bucketName, ...props }: DataStackProps) {
    super(scope, id, { terminationProtection: !ephemeral, ...props });
    const removalPolicy = ephemeral ? RemovalPolicy.DESTROY : RemovalPolicy.RETAIN;

    const table = (id: string, sortKey: AttributeType) => {
      const created = new Table(this, id, {
        partitionKey: { name: 'pk', type: AttributeType.STRING },
        sortKey: { name: 'sk', type: sortKey },
        billingMode: BillingMode.PAY_PER_REQUEST,
        timeToLiveAttribute: 'expiresAt',
        pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: !ephemeral },
        deletionProtection: !ephemeral,
        removalPolicy,
      });
      if (ephemeral) Validations.of(created).acknowledge({ id: 'AwsSolutions-DDB3', reason: 'Tabela de testes, descartável.' });
      return created;
    };

    // Um item por evento: pk = stream da rodada, sk = versão. A escrita condicional na sk faz o controle de concorrência.
    this.events = table('Events', AttributeType.NUMBER);
    // Conta, eventos de auditoria e trava de unicidade do Player ID (ver DynamoAccountRepository).
    this.accounts = table('Accounts', AttributeType.STRING);
    // Eventos do ADM, trava do hash do token do enviador e ponteiro da rodada atual (ver DynamoEventRegistry).
    this.tournaments = table('Tournaments', AttributeType.STRING);

    this.snapshots = new Bucket(this, 'Snapshots', {
      bucketName,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      lifecycleRules: [{ expiration: ephemeral ? Duration.days(1) : RETENTION }],
      removalPolicy,
    });
    Validations.of(this.snapshots).acknowledge(
      { id: 'AwsSolutions-S1', reason: 'Bucket privado, só acessado pela API; CloudTrail cobre auditoria sem bucket extra de logs.' },
    );

    new CfnOutput(this, 'EventsTableName', { value: this.events.tableName });
    new CfnOutput(this, 'AccountsTableName', { value: this.accounts.tableName });
    new CfnOutput(this, 'TournamentsTableName', { value: this.tournaments.tableName });
    new CfnOutput(this, 'SnapshotsBucketName', { value: this.snapshots.bucketName });
  }
}
