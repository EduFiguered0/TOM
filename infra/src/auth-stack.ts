import { CfnOutput, Duration, RemovalPolicy, Stack, Validations, type StackProps } from 'aws-cdk-lib';
import {
  AccountRecovery,
  CfnUserPoolGroup,
  FeaturePlan,
  Mfa,
  UserPool,
  UserPoolEmail,
  type UserPoolClient,
} from 'aws-cdk-lib/aws-cognito';
import type { Construct } from 'constructs';

export interface AuthStackProps extends StackProps {
  /** true para a stack de testes: pode ser destruída e permite login por senha via API de admin. */
  ephemeral: boolean;
}

/** Papéis que vêm como grupos no token (`cognito:groups`); jogador é quem não está em grupo. */
export const ROLE_GROUPS = ['admin', 'judge'] as const;

/** Login: código por e-mail sem senha (Essentials: grátis até 10 mil usuários ativos/mês). Google entra depois. */
export class AuthStack extends Stack {
  readonly userPool: UserPool;
  readonly client: UserPoolClient;

  constructor(scope: Construct, id: string, { ephemeral, ...props }: AuthStackProps) {
    super(scope, id, { terminationProtection: !ephemeral, ...props });

    this.userPool = new UserPool(this, 'Users', {
      featurePlan: FeaturePlan.ESSENTIALS,
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      signInCaseSensitive: false,
      autoVerify: { email: true },
      keepOriginal: { email: true },
      standardAttributes: { email: { required: true, mutable: false } },
      signInPolicy: { allowedFirstAuthFactors: { password: true, emailOtp: true } },
      // O Cognito exige senha habilitada; ninguém usa, então a política é forte.
      passwordPolicy: { minLength: 16, requireLowercase: true, requireUppercase: true, requireDigits: true, requireSymbols: true },
      accountRecovery: AccountRecovery.EMAIL_ONLY,
      mfa: Mfa.OFF,
      // Remetente definitivo (SES) fica para antes do primeiro evento; até lá, o envio do Cognito (custo zero).
      email: UserPoolEmail.withCognito(),
      deletionProtection: !ephemeral,
      removalPolicy: ephemeral ? RemovalPolicy.DESTROY : RemovalPolicy.RETAIN,
    });
    Validations.of(this.userPool).acknowledge(
      { id: 'AwsSolutions-COG2', reason: 'Sem senha: o login já é um código de uso único por e-mail (ou Google).' },
      { id: 'AwsSolutions-COG8', reason: 'Proteção contra ameaças só existe no plano Plus (US$ 0,02/usuário, sem franquia grátis).' },
    );

    for (const group of ROLE_GROUPS) {
      new CfnUserPoolGroup(this, `Group-${group}`, { userPoolId: this.userPool.userPoolId, groupName: group });
    }

    this.client = this.userPool.addClient('App', {
      generateSecret: false,
      authFlows: { user: true, adminUserPassword: ephemeral },
      accessTokenValidity: Duration.minutes(15),
      idTokenValidity: Duration.minutes(15),
      refreshTokenValidity: Duration.days(30),
      enableTokenRevocation: true,
      preventUserExistenceErrors: true,
    });

    new CfnOutput(this, 'UserPoolId', { value: this.userPool.userPoolId });
    new CfnOutput(this, 'UserPoolClientId', { value: this.client.userPoolClientId });
  }
}
