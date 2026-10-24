import { App, Validations } from 'aws-cdk-lib';
import { AwsSolutionsChecks } from 'cdk-nag';
import { ApiStack } from './api-stack.js';
import { AuthStack } from './auth-stack.js';
import { DataStack, snapshotsBucketName } from './data-stack.js';
import { WebStack } from './web-stack.js';

// O projeto AWS só permite recursos regionais em us-east-2.
export const REGION = 'us-east-2';

export const buildApp = (account: string | undefined, app = new App()) => {
  if (!account) throw new Error('Conta AWS desconhecida: rode o CDK com credenciais (perfil tom) para definir CDK_DEFAULT_ACCOUNT.');
  // Referências fracas (Fn::GetStackOutput): sem exports, não há "deadly embrace" ao remover recursos.
  app.node.setContext('@aws-cdk/core:defaultCrossStackReferences', 'weak');
  const env = { account, region: REGION };
  const bucket = (ephemeral: boolean) => snapshotsBucketName(account, REGION, ephemeral);
  const data = new DataStack(app, 'TomData', { env, ephemeral: false, snapshotsBucketName: bucket(false) });
  const test = new DataStack(app, 'TomTest', { env, ephemeral: true, snapshotsBucketName: bucket(true) });
  const auth = new AuthStack(app, 'TomAuth', { env, ephemeral: false, domainPrefix: 'tom-pokemon-login' });
  const authTest = new AuthStack(app, 'TomAuthTest', { env, ephemeral: true, domainPrefix: 'tom-pokemon-login-teste' });
  const api = new ApiStack(app, 'TomApi', {
    env, ephemeral: false, accounts: data.accounts, events: data.events, tournaments: data.tournaments, snapshotsBucket: bucket(false),
    userPool: auth.userPool, client: auth.client,
  });
  const apiTest = new ApiStack(app, 'TomApiTest', {
    env, ephemeral: true, accounts: test.accounts, events: test.events, tournaments: test.tournaments, snapshotsBucket: bucket(true),
    userPool: authTest.userPool, client: authTest.client,
  });
  const web = new WebStack(app, 'TomWeb', { env, api: api.functionUrl, region: REGION });
  Validations.of(app).addPlugins(new AwsSolutionsChecks(app, { verbose: true }));
  return { app, data, test, auth, authTest, api, apiTest, web };
};
