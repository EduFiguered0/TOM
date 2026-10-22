import { describe, expect, it } from 'vitest';
import { DOMAIN_VERSION } from './index.js';

describe('domain', () => {
  it('exporta a versão do pacote', () => {
    expect(DOMAIN_VERSION).toBe('0.0.0');
  });
});
