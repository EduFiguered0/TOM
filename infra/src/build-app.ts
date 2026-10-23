import { App, Validations } from 'aws-cdk-lib';
import { AwsSolutionsChecks } from 'cdk-nag';
import { DataStack } from './data-stack.js';

// O projeto AWS só permite recursos regionais em us-east-2.
export const REGION = 'us-east-2';

export const buildApp = (account?: string, app = new App()) => {
  const env = account ? { account, region: REGION } : { region: REGION };
  const data = new DataStack(app, 'TomData', { env, ephemeral: false });
  const test = new DataStack(app, 'TomTest', { env, ephemeral: true });
  Validations.of(app).addPlugins(new AwsSolutionsChecks(app, { verbose: true }));
  return { app, data, test };
};
