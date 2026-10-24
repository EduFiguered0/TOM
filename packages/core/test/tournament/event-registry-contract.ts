import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ConcurrencyError, type EventRegistry, type TournamentEvent } from '../../src/index.js';

const event = (): TournamentEvent => ({
  id: randomUUID(),
  label: 'Liga de Outubro',
  tournament: null,
  tokenHash: randomUUID().replace(/-/g, ''),
  revoked: false,
  createdAt: new Date('2026-10-24T13:00:00Z'),
  createdBy: 'adm',
  judges: [],
  date: '2026-10-24',
  roundMinutes: 30,
  status: 'open',
  code: randomUUID().slice(0, 8).toUpperCase(),
  standings: null,
});

/**
 * Contrato da porta: toda implementação (memória, DynamoDB) deve passar.
 * Ids e hashes únicos por execução, porque implementações reais guardam dados entre execuções.
 */
export const eventRegistryContract = (name: string, create: () => EventRegistry) => {
  describe(`EventRegistry: ${name}`, () => {
    it('grava e acha por id e pelo hash do token', async () => {
      const registry = create();
      const e = event();
      expect(await registry.save(e, 0)).toBe(1);
      expect(await registry.get(e.id)).toEqual({ event: e, version: 1 });
      expect(await registry.findByTokenHash(e.tokenHash)).toEqual({ event: e, version: 1 });
      expect(await registry.findByTokenHash('desconhecido')).toBeNull();
    });

    it('recusa versão desatualizada', async () => {
      const registry = create();
      const e = event();
      await registry.save(e, 0);
      await expect(registry.save(e, 0)).rejects.toThrow(ConcurrencyError);
      expect(await registry.save({ ...e, tournament: 'FODASE' }, 1)).toBe(2);
      expect((await registry.findByTokenHash(e.tokenHash))?.event.tournament).toBe('FODASE');
    });

    it('create grava o evento e o ponteiro latest; findByCode acha pelo código', async () => {
      const registry = create();
      const before = (await registry.latest())?.event.id ?? null;
      const e = event();
      await registry.create(e, before);
      expect(await registry.get(e.id)).toEqual({ event: e, version: 1 });
      expect((await registry.latest())?.event.id).toBe(e.id);
      expect((await registry.findByCode(e.code ?? ''))?.event.id).toBe(e.id);
      expect(await registry.findByCode('NAOEXISTE')).toBeNull();
      expect((await registry.findByTokenHash(e.tokenHash))?.event.id).toBe(e.id);
    });

    it('create recusa quando o latest mudou', async () => {
      const registry = create();
      const before = (await registry.latest())?.event.id ?? null;
      const first = event();
      await registry.create(first, before);
      await expect(registry.create(event(), before)).rejects.toThrow(ConcurrencyError);
      expect((await registry.latest())?.event.id).toBe(first.id);
    });

    it('guarda a rodada atual', async () => {
      const registry = create();
      const current = { eventId: randomUUID(), ref: { tournament: 'FODASE', division: 'Divisão Mestre', round: 2 }, updatedAt: new Date('2026-10-24T14:00:00Z') };
      await registry.setCurrent(current);
      expect(await registry.current()).toEqual(current);
    });
  });
};
