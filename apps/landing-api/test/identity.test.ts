import { describe, expect, it } from 'vitest';
import { GoogleOnlyError, identityOf } from '../src/identity.js';

describe('identidade do token', () => {
  it('usuário federado do Google: sub do Google tirado do username', () => {
    expect(identityOf({ sub: 'c-1', username: 'google_1234567890' })).toEqual({ cognitoSub: 'c-1', googleSub: '1234567890' });
  });

  it('login por senha (username UUID) não é aceito na landing', () => {
    expect(() => identityOf({ sub: 'c-1', username: '8f1c2a7e-0000-4000-8000-000000000000' })).toThrow(GoogleOnlyError);
  });
});
