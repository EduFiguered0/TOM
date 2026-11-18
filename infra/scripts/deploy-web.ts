/**
 * Publica o site do TOM: build, config.json de produção, envio ao S3 e limpeza do cache do CloudFront.
 * Uso: npm run web:deploy (perfil AWS `tom`, ou AWS_PROFILE).
 */
import { REGION } from '../src/build-app.js';
import { outputs, publishSite } from './publish-site.js';

const main = async () => {
  const auth = await outputs('tom-prod-auth');
  const url = await publishSite({
    stack: 'TomWeb',
    workspace: '@tom/web',
    distDir: 'apps/web/dist',
    config: {
      region: REGION,
      userPoolClientId: auth('UserPoolClientId'),
      loginDomain: auth('LoginDomain'),
      google: auth('GoogleEnabled') === 'true',
    },
  });
  console.log(`site publicado: ${url}`);
};

await main();
