import { describe, expect, it } from 'vitest';
import { eventFromStored as fromStored } from '../src/dynamo-event-registry.js';

describe('evento lido do DynamoDB', () => {
  it('evento de antes da escala de juízes vem com a escala vazia', () => {
    const stored = { id: 'ev', label: 'Liga', tournament: null, tokenHash: 'h', revoked: false, createdAt: '2026-10-24T13:00:00.000Z', createdBy: 'adm' };
    expect(fromStored(stored as never)).toMatchObject({ judges: [], createdAt: new Date('2026-10-24T13:00:00Z') });
    expect(fromStored({ ...stored, judges: ['j1'] }).judges).toEqual(['j1']);
  });
});
