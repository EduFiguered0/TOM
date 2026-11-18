/**
 * Deploy da landing da GoodGame: confere o login da AWS, sobe a stack tom-prod-gg-landing e publica o site.
 * Uso: npm run landing:deploy (perfil AWS `tom`, ou AWS_PROFILE). Ver docs/landing-goodgame.md.
 */
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { REGION } from '../src/build-app.js';
import { aws, outputs, publishSite, root } from './publish-site.js';

const STACK = 'tom-prod-gg-landing';

const main = async () => {
  try {
    execSync(`aws sts get-caller-identity --profile ${aws.profile}`, { stdio: 'ignore' });
  } catch {
    console.error(`✖ Login da AWS vencido: rode aws login --profile ${aws.profile} e tente de novo.`);
    process.exit(1);
  }
  // Mudança de IAM pede confirmação do CDK: num terminal sem interação o deploy para e avisa.
  execSync(`npx cdk deploy ${STACK} --exclusively --profile ${aws.profile}`, { cwd: join(root, 'infra'), stdio: 'inherit' });

  const stack = await outputs(STACK);
  const url = await publishSite({
    stack: STACK,
    workspace: '@tom/landing',
    distDir: 'apps/landing/dist',
    config: { region: REGION, userPoolClientId: stack('UserPoolClientId'), loginDomain: stack('LoginDomain') },
  });
  console.log(`landing publicada: ${url}`);
};

await main();
