import { App, Validations } from 'aws-cdk-lib';
import { AwsSolutionsChecks } from 'cdk-nag';
import { ApiStack } from './api-stack.js';
import { AuthStack } from './auth-stack.js';
import { DataStack, snapshotsBucketName } from './data-stack.js';
import { nameOf, type Stage } from './names.js';
import { WebStack } from './web-stack.js';

// O projeto AWS só permite recursos regionais em us-east-2.
export const REGION = 'us-east-2';

/** O nome antigo (tom-pokemon-login) continua preso ao pool guardado. */
const LOGIN_PREFIX = 'ggtcg-login';
/** Site de produção e o servidor local de desenvolvimento. */
const CALLBACK_URLS = ['https://dvaep2eni3fqm.cloudfront.net/', 'http://localhost:5173/'];

export const buildApp = (account: string | undefined, app = new App()) => {
  if (!account) throw new Error('Conta AWS desconhecida: rode o CDK com credenciais (perfil tom) para definir CDK_DEFAULT_ACCOUNT.');
  // Referências fracas (Fn::GetStackOutput): sem exports, não há "deadly embrace" ao remover recursos.
  app.node.setContext('@aws-cdk/core:defaultCrossStackReferences', 'weak');
  const env = { account, region: REGION };
  const bucket = (stage: Stage) => snapshotsBucketName(account, stage);
  // Cada stack de produção tem um gêmeo de teste; o nome da stack segue o dos recursos (tom-<ambiente>-<parte>).
  const stack = (stage: Stage, part: string) => nameOf(stage, part);
  const data = new DataStack(app, stack('prod', 'data'), { env, stage: 'prod', snapshotsBucketName: bucket('prod') });
  const test = new DataStack(app, stack('test', 'data'), { env, stage: 'test', snapshotsBucketName: bucket('test') });
  // Google só depois de o provedor existir no pool (guia de operação, "Ativar o Google"); os testes nunca usam.
  const google = app.node.tryGetContext('google') === true;
  const auth = new AuthStack(app, stack('prod', 'auth'), { env, stage: 'prod', domainPrefix: LOGIN_PREFIX, google, callbackUrls: CALLBACK_URLS });
  const authTest = new AuthStack(app, stack('test', 'auth'), { env, stage: 'test', domainPrefix: 'ggtcg-login-teste', google: false, callbackUrls: [] });
  const api = new ApiStack(app, stack('prod', 'api'), {
    env, stage: 'prod', accounts: data.accounts, events: data.events, tournaments: data.tournaments, snapshotsBucket: bucket('prod'),
    userPool: auth.userPool, client: auth.client,
  });
  const apiTest = new ApiStack(app, stack('test', 'api'), {
    env, stage: 'test', accounts: test.accounts, events: test.events, tournaments: test.tournaments, snapshotsBucket: bucket('test'),
    userPool: authTest.userPool, client: authTest.client,
  });
  // Nome antigo de propósito: o CloudFormation não renomeia stacks, e recriar esta trocaria o endereço do site (CloudFront).
  const web = new WebStack(app, 'TomWeb', {
    env, stage: 'prod', api: api.functionUrl, region: REGION, loginDomain: `https://${LOGIN_PREFIX}.auth.${REGION}.amazoncognito.com`,
  });
  Validations.of(app).addPlugins(new AwsSolutionsChecks(app, { verbose: true }));
  return { app, data, test, auth, authTest, api, apiTest, web };
};
