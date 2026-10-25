import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ConfigError, JsonFileSentLog, LocalFolder, parseConfig } from '../src/index.js';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'tom-uploader-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('LocalFolder', () => {
  it('lista só arquivos .html com tamanho e data', async () => {
    await writeFile(join(dir, 'FODASEpairings.html'), '<html></html>');
    await writeFile(join(dir, 'main.css'), 'x');
    await mkdir(join(dir, 'images.html'));
    const files = await new LocalFolder(dir).list();
    expect(files.map((f) => [f.fileName, f.size])).toEqual([['FODASEpairings.html', 13]]);
    expect(files[0]?.modifiedAt).toBeInstanceOf(Date);
  });

  it('recusa ler fora da pasta', async () => {
    await expect(new LocalFolder(dir).read('../segredo.html')).rejects.toThrow(/inválido/);
  });
});

describe('JsonFileSentLog', () => {
  it('persiste entre aberturas e cria a pasta', async () => {
    const path = join(dir, 'estado', 'sent.json');
    const log = await JsonFileSentLog.open(path);
    expect(await log.get('a.html')).toBeUndefined();
    await log.set('a.html', 'abc');
    expect(await (await JsonFileSentLog.open(path)).get('a.html')).toBe('abc');
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({ 'a.html': 'abc' });
  });
});

describe('parseConfig', () => {
  it('lê pasta, intervalo e período de quietude', () => {
    const c = parseConfig(['--folder', dir, '--state', join(tmpdir(), 'x.json'), '--interval', '500', '--quiet', '2000']);
    expect(c).toMatchObject({ folder: dir, intervalMs: 500, quietMs: 2000 });
  });

  it('exige a pasta e números válidos', () => {
    expect(() => parseConfig([])).toThrow(ConfigError);
    expect(() => parseConfig(['--folder', dir, '--interval', '0'])).toThrow(ConfigError);
  });

  it('nunca grava estado dentro da pasta do TOM', () => {
    expect(() => parseConfig(['--folder', dir, '--state', join(dir, 'sent.json')])).toThrow(/não pode ficar dentro/);
  });
});
