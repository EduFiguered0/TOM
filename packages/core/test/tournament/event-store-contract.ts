import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ConcurrencyError, type EventStore, type RoundEvent, type RoundRef } from '../../src/index.js';
import { actors, pairing, ref as baseRef } from './support.js';

const at = new Date('2026-10-23T14:00:00Z');

const paired = (ref: RoundRef, id: string): RoundEvent => ({
  id, ref, at, actor: actors.uploader, type: 'round_paired', pairing: pairing(ref),
});

const reported = (ref: RoundRef, id: string): RoundEvent => ({
  id, ref, at: new Date(at.getTime() + 60_000), actor: actors.p1,
  type: 'report_submitted', table: 1, side: 'player1', report: { kind: 'score', own: 2, opponent: 1 },
});

/**
 * Contrato da porta: toda implementação (memória, DynamoDB) deve passar.
 * Cada teste usa um torneio novo, porque implementações reais guardam dados entre execuções.
 */
export const eventStoreContract = (name: string, create: () => EventStore) => {
  describe(`EventStore: ${name}`, () => {
    const freshRef = (): RoundRef => ({ ...baseRef, tournament: `teste-${randomUUID()}` });

    it('stream novo começa vazio na versão 0', async () => {
      expect(await create().read(freshRef())).toEqual({ events: [], version: 0 });
    });

    it('grava em ordem e devolve a nova versão', async () => {
      const store = create();
      const ref = freshRef();
      expect(await store.append(ref, [paired(ref, 'a')], 0)).toBe(1);
      expect(await store.append(ref, [paired(ref, 'b'), paired(ref, 'c')], 1)).toBe(3);
      const { events, version } = await store.read(ref);
      expect(events.map((e) => e.id)).toEqual(['a', 'b', 'c']);
      expect(version).toBe(3);
    });

    it('devolve o evento exatamente como foi gravado, com a data como Date', async () => {
      const store = create();
      const ref = freshRef();
      const written = [paired(ref, 'a'), reported(ref, 'b')];
      await store.append(ref, written, 0);
      const { events } = await store.read(ref);
      expect(events).toEqual(written);
      expect(events[1]?.at).toBeInstanceOf(Date);
    });

    it('recusa gravação com versão desatualizada sem alterar nada', async () => {
      const store = create();
      const ref = freshRef();
      await store.append(ref, [paired(ref, 'a')], 0);
      await expect(store.append(ref, [paired(ref, 'b'), paired(ref, 'c')], 0)).rejects.toThrow(ConcurrencyError);
      expect((await store.read(ref)).version).toBe(1);
    });

    it('gravações simultâneas na mesma versão: exatamente uma vence', async () => {
      const store = create();
      const ref = freshRef();
      const results = await Promise.allSettled(['a', 'b', 'c'].map((id) => store.append(ref, [paired(ref, id)], 0)));
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      for (const r of results) if (r.status === 'rejected') expect(r.reason).toBeInstanceOf(ConcurrencyError);
      expect((await store.read(ref)).version).toBe(1);
    });

    it('recusa gravação à frente da versão atual (sem buracos)', async () => {
      const store = create();
      const ref = freshRef();
      await store.append(ref, [paired(ref, 'a')], 0);
      await expect(store.append(ref, [paired(ref, 'b')], 3)).rejects.toThrow(ConcurrencyError);
      expect((await store.read(ref)).version).toBe(1);
    });

    it('append vazio só confere a versão', async () => {
      const store = create();
      const ref = freshRef();
      await store.append(ref, [paired(ref, 'a')], 0);
      expect(await store.append(ref, [], 1)).toBe(1);
      await expect(store.append(ref, [], 0)).rejects.toThrow(ConcurrencyError);
    });

    it('streams de rodadas diferentes são independentes', async () => {
      const store = create();
      const ref = freshRef();
      await store.append(ref, [paired(ref, 'a')], 0);
      expect((await store.read({ ...ref, round: 4 })).version).toBe(0);
      expect((await store.read({ ...ref, division: 'Divisão Júnior' })).version).toBe(0);
    });
  });
};
