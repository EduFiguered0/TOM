/**
 * Deploy de produção num comando: confere o repositório e o login da AWS, sobe a API e o CloudFront e publica o site.
 * Uso: npm run deploy (perfil AWS `tom`, ou AWS_PROFILE). tom-prod-data e tom-prod-auth continuam à parte (guia de operação, "AWS").
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { preflight } from './deploy-checks.js';

const root = fileURLToPath(new URL('../..', import.meta.url));
const profile = process.env['AWS_PROFILE'] ?? 'tom';

const git = (args: string): string => execSync(`git ${args}`, { cwd: root, encoding: 'utf8' }).trim();
const count = (range: string): number => Number(git(`rev-list --count ${range}`));
const run = (command: string, cwd = root) => { execSync(command, { cwd, stdio: 'inherit' }); };
const step = (text: string) => { console.log(`\n▶ ${text}`); };

const main = () => {
  step('Conferindo o repositório');
  git('fetch --quiet --tags origin main');
  const lastTag = (() => { try { return git('describe --tags --abbrev=0'); } catch { return null; } })();
  const { errors, warnings } = preflight({
    branch: git('rev-parse --abbrev-ref HEAD'),
    dirty: git('status --porcelain') !== '',
    behind: count('HEAD..origin/main'),
    ahead: count('origin/main..HEAD'),
    unreleased: lastTag ? count(`${lastTag}..HEAD`) : 0,
  });
  for (const w of warnings) console.log(`  ⚠ ${w}`);
  if (errors.length > 0) {
    for (const e of errors) console.error(`  ✖ ${e}`);
    process.exit(1);
  }

  step(`Conferindo o login da AWS (perfil ${profile})`);
  try {
    execSync(`aws sts get-caller-identity --profile ${profile}`, { stdio: 'ignore' });
  } catch {
    console.error(`  ✖ Login da AWS vencido: rode aws login --profile ${profile} e tente de novo.`);
    process.exit(1);
  }

  // Mudança de IAM pede confirmação do CDK: num terminal sem interação (ex.: "!" no Claude Code) o deploy para e avisa.
  step('API e CloudFront (tom-prod-api, TomWeb)');
  run(`npx cdk deploy tom-prod-api TomWeb --exclusively --profile ${profile}`, join(root, 'infra'));

  step('Site');
  run('npm run web:deploy');

  const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string };
  step(`Pronto: v${version} (${git('rev-parse --short HEAD')}) no ar.`);
};

main();
