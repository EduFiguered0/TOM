import { describe, expect, it } from 'vitest';
import { pageFor } from '../src/routes.js';

describe('páginas do site', () => {
  it.each([
    ['/', 'home'],
    ['/tv', 'tv'],
    ['/tv/', 'tv'],
    ['/privacidade', 'privacy'],
    ['/conta', 'account'],
    ['/painel', 'account'],
    ['/qualquer', 'home'],
    ['/e/ABCD2345', 'join'],
    ['/e/', 'home'],
  ] as const)('%s → %s', (path, page) => {
    expect(pageFor(path)).toBe(page);
  });
});
