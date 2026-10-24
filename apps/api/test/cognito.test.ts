import { describe, expect, it } from 'vitest';
import { providerOf } from '../src/cognito.js';

describe('provedor do login', () => {
  it('usuário federado do Google pelo prefixo; o resto é senha', () => {
    expect(providerOf('Google_1234567890')).toBe('google');
    expect(providerOf('google_1234567890')).toBe('google');
    expect(providerOf('3b1f0c2e-aaaa-bbbb-cccc-1234567890ab')).toBe('password');
  });
});
