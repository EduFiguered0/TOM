import { describe, expect, it } from 'vitest';
import { eventFromStored as fromStored } from '../src/dynamo-event-registry.js';

describe('evento lido do DynamoDB', () => {
  it('evento de antes da escala de juízes vem com a escala vazia', () => {
    const stored = { id: 'ev', label: 'Liga', tournament: null, tokenHash: 'h', revoked: false, createdAt: '2026-10-24T13:00:00.000Z', createdBy: 'adm' };
    expect(fromStored(stored as never)).toMatchObject({ judges: [], createdAt: new Date('2026-10-24T13:00:00Z') });
    expect(fromStored({ ...stored, judges: ['j1'] }).judges).toEqual(['j1']);
  });

  it('evento antigo sem status lê como encerrado, 50 min (padrão), sem código', () => {
    const stored = { id: 'ev', label: 'Liga', tournament: null, tokenHash: 'h', revoked: false, createdAt: '2026-10-24T13:00:00.000Z', createdBy: 'adm' };
    expect(fromStored(stored as never)).toMatchObject({ status: 'closed', roundMinutes: 50, code: null, standings: null, date: '2026-10-24' });
    expect(fromStored({ ...stored, createdAt: '2026-10-25T01:00:00.000Z' }).date).toBe('2026-10-24');
  });

  it('evento gravado em "confirmando presença" lê como inscrições abertas', () => {
    const stored = { id: 'ev', label: 'Liga', tournament: null, tokenHash: 'h', revoked: false, createdAt: '2026-10-24T13:00:00.000Z', createdBy: 'adm' };
    expect(fromStored({ ...stored, status: 'confirming' } as never).status).toBe('open');
  });

  it('evento de antes da TV nova: sem classificação parcial e fora da TV', () => {
    const stored = { id: 'ev', label: 'Liga', tournament: null, tokenHash: 'h', revoked: false, createdAt: '2026-10-24T13:00:00.000Z', createdBy: 'adm' };
    expect(fromStored(stored as never)).toMatchObject({ partial: null, onTv: false });
  });
});
