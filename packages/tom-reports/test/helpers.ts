import { readFileSync } from 'node:fs';

export const fixture = (path: string): string =>
  readFileSync(new URL(`./fixtures/${path}.html`, import.meta.url), 'utf8');
