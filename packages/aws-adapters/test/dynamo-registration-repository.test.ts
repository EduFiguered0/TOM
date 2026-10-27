import { describe, expect, it } from 'vitest';
import { registrationFromStored as fromStored } from '../src/dynamo-registration-repository.js';

describe('inscrição lida do DynamoDB', () => {
  it('inscrição da época da confirmação de presença: não aguarda aprovação e perde o "confirmado"', () => {
    const stored = {
      eventId: 'ev', accountId: 'a1', playerId: '100001', name: 'Ana', birthYear: 1990, at: '2026-10-24T13:00:00.000Z',
      by: 'self', confirmed: true, launched: false, removed: false,
    };
    const registration = fromStored(stored as never);
    expect(registration).toMatchObject({ awaitingApproval: false, paid: false, at: new Date('2026-10-24T13:00:00Z') });
    expect(registration).not.toHaveProperty('confirmed');
  });

  it('inscrição antiga com "name": nome e sobrenome separados no primeiro espaço', () => {
    const stored = {
      eventId: 'ev', accountId: 'a1', playerId: '100001', name: 'Madonna', birthYear: 1990, at: '2026-10-24T13:00:00.000Z',
      by: 'self', awaitingApproval: false, launched: false, removed: false,
    };
    const registration = fromStored(stored as never);
    expect(registration).toMatchObject({ firstName: 'Madonna', lastName: '' });
    expect(registration).not.toHaveProperty('name');
  });
});
