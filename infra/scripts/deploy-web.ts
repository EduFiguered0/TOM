/**
 * Publica o site: build, config.json de produção, envio ao S3 e limpeza do cache do CloudFront.
 * Uso: npm run web:deploy (perfil AWS `tom`, ou AWS_PROFILE).
 */
import { CloudFormationClient, DescribeStacksCommand } from '@aws-sdk/client-cloudformation';
import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';
import { DeleteObjectsCommand, paginateListObjectsV2, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { execSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REGION } from '../src/build-app.js';

const aws = { region: REGION, profile: process.env['AWS_PROFILE'] ?? 'tom' };
const root = fileURLToPath(new URL('../..', import.meta.url));
const dist = join(root, 'apps/web/dist');

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};
/** Arquivos com hash no nome nunca mudam; os demais são relidos a cada acesso. */
const cacheControl = (key: string) => (key.startsWith('assets/') ? 'public, max-age=31536000, immutable' : 'no-cache');

const outputs = async (stack: string) => {
  const { Stacks } = await new CloudFormationClient(aws).send(new DescribeStacksCommand({ StackName: stack }));
  const values = new Map((Stacks?.[0]?.Outputs ?? []).map((o) => [o.OutputKey ?? '', o.OutputValue ?? ''] as const));
  return (key: string): string => {
    const value = values.get(key);
    if (!value) throw new Error(`Output ${key} ausente na stack ${stack}; rode o deploy da infra.`);
    return value;
  };
};

const files = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)]));

const main = async () => {
  const [web, auth] = await Promise.all([outputs('TomWeb'), outputs('TomAuth')]);
  const bucket = web('SiteBucket');

  execSync('npm run build -w @tom/web', { cwd: root, stdio: 'inherit' });
  writeFileSync(join(dist, 'config.json'), `${JSON.stringify({ region: REGION, userPoolClientId: auth('UserPoolClientId') }, null, 2)}\n`);

  const s3 = new S3Client(aws);
  const keys = files(dist).map((f) => relative(dist, f).replaceAll('\\', '/')).filter((k) => !k.endsWith('.map'));
  // Assets primeiro e index.html por último: quem abrir o site no meio do envio nunca recebe uma página sem os arquivos dela.
  keys.sort((a, b) => Number(a === 'index.html') - Number(b === 'index.html'));
  for (const key of keys) {
    await s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: readFileSync(join(dist, key)),
      ContentType: TYPES[extname(key)] ?? 'application/octet-stream',
      CacheControl: cacheControl(key),
    }));
    console.log(`enviado ${key}`);
  }

  const stale: string[] = [];
  for await (const page of paginateListObjectsV2({ client: s3 }, { Bucket: bucket })) {
    for (const { Key } of page.Contents ?? []) if (Key && !keys.includes(Key)) stale.push(Key);
  }
  if (stale.length) {
    await s3.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: stale.map((Key) => ({ Key })) } }));
    console.log(`removidos ${String(stale.length)} arquivos antigos`);
  }

  await new CloudFrontClient(aws).send(new CreateInvalidationCommand({
    DistributionId: web('DistributionId'),
    InvalidationBatch: { CallerReference: String(Date.now()), Paths: { Quantity: 2, Items: ['/index.html', '/config.json'] } },
  }));
  console.log(`site publicado: ${web('SiteUrl')}`);
};

await main();
