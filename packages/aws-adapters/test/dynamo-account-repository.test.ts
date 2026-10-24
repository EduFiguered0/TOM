import { describe, expect, it } from 'vitest';
import { fromStored } from '../src/dynamo-account-repository.js';

const stored = {
  id: 'a1', email: 'ana@example.com', logins: ['l1'], activeSession: 's1', createdAt: '2026-10-23T14:00:00.000Z',
  profile: { name: 'Ana Souza', birthYear: 1990, phone: null, guardianConsent: false },
};

describe('conta lida do DynamoDB', () => {
  it('formato antigo: confirmado (tinha trava) vira o Player ID; pendente (sem trava) volta a não ter; o novo e o vazio ficam', () => {
    expect(fromStored({ ...stored, playerId: { value: '1122334', confirmed: true } } as never).playerId).toBe('1122334');
    expect(fromStored({ ...stored, playerId: { value: '1122334', confirmed: false } } as never).playerId).toBeNull();
    expect(fromStored({ ...stored, playerId: '1122334' } as never).playerId).toBe('1122334');
    expect(fromStored({ ...stored, playerId: null }).playerId).toBeNull();
    expect(fromStored({ ...stored, playerId: null }).createdAt).toEqual(new Date('2026-10-23T14:00:00Z'));
  });
});
