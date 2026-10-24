import { CfnOutput, Duration, RemovalPolicy, Stack, Validations, type StackProps } from 'aws-cdk-lib';
import {
  AccountRecovery,
  CfnUserPoolGroup,
  FeaturePlan,
  ManagedLoginVersion,
  Mfa,
  OAuthScope,
  UserPool,
  UserPoolClientIdentityProvider,
  UserPoolEmail,
  UserPoolOperation,
  VerificationEmailStyle,
  type UserPoolClient,
} from 'aws-cdk-lib/aws-cognito';
import { PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { Architecture, Code, Function as LambdaFunction, Runtime } from 'aws-cdk-lib/aws-lambda';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import type { Construct } from 'constructs';

export interface AuthStackProps extends StackProps {
  /** true para a stack de testes: pode ser destruída e permite login por senha via API de admin. */
  ephemeral: boolean;
  /** Prefixo do domínio de login (`<prefixo>.auth.us-east-2.amazoncognito.com`), usado no retorno do Google. */
  domainPrefix: string;
  /** Liga o Google no cliente do app; só depois de o provedor ser criado no pool (README). */
  google: boolean;
  /** Endereços do site para onde o login do Google volta. */
  callbackUrls: string[];
}

/** Só o ADM vem como grupo no token (`cognito:groups`); o juiz é marca na conta, posta pelo ADM na Equipe. */
export const ROLE_GROUPS = ['admin'] as const;

/** Cadastro com senha confirmado na hora, sem e-mail de código; o e-mail fica verificado para o "Esqueci minha senha". */
export const PRE_SIGN_UP_CODE = `exports.handler = async (event) => {
  if (event.triggerSource === 'PreSignUp_SignUp') {
    event.response.autoConfirmUser = true;
    event.response.autoVerifyEmail = true;
  }
  return event;
};`;

/** Login: e-mail e senha, ou Google (Essentials: grátis até 10 mil usuários ativos/mês). */
export class AuthStack extends Stack {
  readonly userPool: UserPool;
  readonly client: UserPoolClient;
  readonly loginDomain: string;

  constructor(scope: Construct, id: string, { ephemeral, domainPrefix, google, callbackUrls, ...props }: AuthStackProps) {
    super(scope, id, { terminationProtection: !ephemeral, ...props });

    // "V2": o pool de antes tinha o e-mail fixo, e atributo de pool existente não muda; o antigo (produção) ficou guardado.
    this.userPool = new UserPool(this, 'UsersV2', {
      featurePlan: FeaturePlan.ESSENTIALS,
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      signInCaseSensitive: false,
      autoVerify: { email: true },
      keepOriginal: { email: true },
      // Alterável: o Google regrava o e-mail a cada login, e com o atributo fixo só o primeiro login funciona.
      standardAttributes: { email: { required: true, mutable: true } },
      signInPolicy: { allowedFirstAuthFactors: { password: true } },
      passwordPolicy: { minLength: 8, requireLowercase: true, requireUppercase: false, requireDigits: true, requireSymbols: false },
      accountRecovery: AccountRecovery.EMAIL_ONLY,
      // Com o cadastro confirmado pelo gatilho, este e-mail só sai no "Esqueci minha senha".
      userVerification: {
        emailStyle: VerificationEmailStyle.CODE,
        emailSubject: 'Código para criar sua senha - Torneios TOM',
        emailBody: 'Olá! Seu código para criar uma nova senha é {####}. Se você não pediu, ignore este e-mail.',
      },
      mfa: Mfa.OFF,
      // Remetente definitivo (SES) fica para antes do primeiro evento; até lá, o envio do Cognito (custo zero).
      email: UserPoolEmail.withCognito(),
      deletionProtection: !ephemeral,
      removalPolicy: ephemeral ? RemovalPolicy.DESTROY : RemovalPolicy.RETAIN,
    });
    Validations.of(this.userPool).acknowledge(
      { id: 'AwsSolutions-COG1', reason: 'Jogadores, inclusive crianças, digitam no celular: 8 caracteres com letras e números.' },
      { id: 'AwsSolutions-COG2', reason: 'MFA desligado de propósito: o celular já é o único dispositivo ativo da conta.' },
      { id: 'AwsSolutions-COG8', reason: 'Proteção contra ameaças só existe no plano Plus (US$ 0,02/usuário, sem franquia grátis).' },
    );

    // Gatilho mínimo, dentro da franquia da Lambda (US$ 0); role própria com logs só no grupo dele.
    const logGroup = new LogGroup(this, 'PreSignUpLogs', { retention: RetentionDays.TWO_WEEKS, removalPolicy: RemovalPolicy.DESTROY });
    const role = new Role(this, 'PreSignUpRole', { assumedBy: new ServicePrincipal('lambda.amazonaws.com') });
    role.addToPolicy(new PolicyStatement({ actions: ['logs:CreateLogStream', 'logs:PutLogEvents'], resources: [logGroup.logGroupArn] }));
    const preSignUp = new LambdaFunction(this, 'PreSignUp', {
      code: Code.fromInline(PRE_SIGN_UP_CODE),
      handler: 'index.handler',
      runtime: Runtime.NODEJS_22_X,
      architecture: Architecture.ARM_64,
      memorySize: 128,
      timeout: Duration.seconds(3),
      role,
      logGroup,
    });
    this.userPool.addTrigger(UserPoolOperation.PRE_SIGN_UP, preSignUp);
    Validations.of(preSignUp).acknowledge({
      id: 'AwsSolutions-L1',
      reason: 'Node 22 acompanha a versão usada no desenvolvimento e nos testes; a migração para Node 24 é feita junto.',
    });

    // Domínio de login grátis; o app manda direto para o Google, sem página intermediária do Cognito.
    const domain = this.userPool.addDomain('Domain', {
      cognitoDomain: { domainPrefix },
      managedLoginVersion: ManagedLoginVersion.CLASSIC_HOSTED_UI,
    });
    this.loginDomain = domain.baseUrl();

    for (const group of ROLE_GROUPS) {
      new CfnUserPoolGroup(this, `Group-${group}`, { userPoolId: this.userPool.userPoolId, groupName: group });
    }

    this.client = this.userPool.addClient('App', {
      generateSecret: false,
      authFlows: { user: true, adminUserPassword: ephemeral },
      accessTokenValidity: Duration.minutes(15),
      idTokenValidity: Duration.minutes(15),
      // O jogador entra uma vez e não digita a senha a cada evento (mensal); a sessão única derruba o celular antigo.
      refreshTokenValidity: Duration.days(365),
      enableTokenRevocation: true,
      preventUserExistenceErrors: true,
      supportedIdentityProviders: [
        UserPoolClientIdentityProvider.COGNITO,
        ...(google ? [UserPoolClientIdentityProvider.custom('Google')] : []),
      ],
      // O escopo de admin deixa o token do Google ler o próprio e-mail (GET /me).
      ...(google
        ? { oAuth: { flows: { authorizationCodeGrant: true }, scopes: [OAuthScope.OPENID, OAuthScope.EMAIL, OAuthScope.COGNITO_ADMIN], callbackUrls, logoutUrls: callbackUrls } }
        : { disableOAuth: true }),
    });

    new CfnOutput(this, 'UserPoolId', { value: this.userPool.userPoolId });
    new CfnOutput(this, 'UserPoolClientId', { value: this.client.userPoolClientId });
    new CfnOutput(this, 'LoginDomain', { value: this.loginDomain });
    new CfnOutput(this, 'GoogleEnabled', { value: String(google) });
  }
}
