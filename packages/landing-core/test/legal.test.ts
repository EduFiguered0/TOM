import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { LEGAL } from '../src/legal.js';

const site = fileURLToPath(new URL('../../../apps/landing/public', import.meta.url));

describe('termos versionados', () => {
  it.each(Object.values(LEGAL))('$kind v$version: o arquivo publicado não muda (hash confere)', (doc) => {
    const text = readFileSync(`${site}${doc.path}`);
    expect(createHash('sha256').update(text).digest('hex')).toBe(doc.sha256);
  });
});
