import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  EventStatusChangedError,
  toPlayerId,
  type EventRegistry,
  type Registration,
  type RegistrationRepository,
  type TournamentEvent,
} from '../../src/index.js';

const event = (): TournamentEvent => ({
  id: randomUUID(), label: 'Liga', tournament: null, tokenHash: randomUUID().replace(/-/g, ''), revoked: false,
  createdAt: new Date('2026-10-24T13:00:00Z'), createdBy: 'adm', judges: [], date: '2026-10-24', roundMinutes: 30,
  status: 'open', code: null, standings: null,
});

const registration = (eventId: string, at: string, accountId = randomUUID()): Registration => ({
  eventId, accountId, playerId: toPlayerId('100001'), firstName: 'Ana', lastName: 'Souza', birthYear: 1990,
  at: new Date(at), by: 'self', awaitingApproval: false, launched: false, removed: false,
});

/** Contrato da porta: toda implementação (memória, DynamoDB) deve passar. Ids únicos por execução. */
export const registrationRepositoryContract = (name: string, create: () => { registry: EventRegistry; registrations: RegistrationRepository }) => {
  describe(`RegistrationRepository: ${name}`, () => {
    it('grava, lê e lista na ordem de inscrição', async () => {
      const { registry, registrations } = create();
      const e = event();
      await registry.save(e, 0);
      const second = registration(e.id, '2026-10-24T13:05:00Z');
      const first = registration(e.id, '2026-10-24T13:01:00Z');
      await registrations.put(second, null);
      await registrations.put(first, 'open');
      expect(await registrations.list(e.id)).toEqual([first, second]);
      expect(await registrations.get(e.id, first.accountId)).toEqual(first);
      expect(await registrations.get(e.id, randomUUID())).toBeNull();
      expect(await registrations.list(randomUUID())).toEqual([]);
    });

    it('regravar troca os campos (aprovar, lançado, removido)', async () => {
      const { registry, registrations } = create();
      const e = event();
      await registry.save(e, 0);
      const r = registration(e.id, '2026-10-24T13:01:00Z');
      await registrations.put(r, null);
      const changed = { ...r, awaitingApproval: true, launched: true, removed: true };
      await registrations.put(changed, null);
      expect(await registrations.get(e.id, r.accountId)).toEqual(changed);
      expect(await registrations.list(e.id)).toHaveLength(1);
    });

    it('guarda: com o evento ainda aberto grava; depois de mudar de status recusa e não grava', async () => {
      const { registry, registrations } = create();
      const e = event();
      await registry.save(e, 0);
      await registrations.put(registration(e.id, '2026-10-24T13:01:00Z'), 'open');
      await registry.save({ ...e, status: 'running' }, 1);
      const late = registration(e.id, '2026-10-24T13:02:00Z');
      await expect(registrations.put(late, 'open')).rejects.toThrow(EventStatusChangedError);
      expect(await registrations.get(e.id, late.accountId)).toBeNull();
      await expect(registrations.put(registration(randomUUID(), '2026-10-24T13:03:00Z'), 'open')).rejects.toThrow(EventStatusChangedError);
    });
  });
};
