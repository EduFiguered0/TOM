import { describe, expect, it } from 'vitest';
import { ConcurrencyError, InMemoryEventStore, type EventStore, type RoundEvent } from '../../src/index.js';
import { actors, pairing, ref } from './support.js';

const event = (id: string): RoundEvent => ({
  id, ref, at: new Date('2026-10-23T14:00:00Z'), actor: actors.uploader, type: 'round_paired', pairing: pairing(),
});

/** Contrato da porta: toda implementação (memória, DynamoDB) deve passar. */
const eventStoreContract = (name: string, create: () => EventStore) => {
  describe(`EventStore: ${name}`, () => {
    it('stream novo começa vazio na versão 0', async () => {
      expect(await create().read(ref)).toEqual({ events: [], version: 0 });
    });

    it('grava em ordem e devolve a nova versão', async () => {
      const store = create();
      expect(await store.append(ref, [event('a')], 0)).toBe(1);
      expect(await store.append(ref, [event('b'), event('c')], 1)).toBe(3);
      const { events, version } = await store.read(ref);
      expect(events.map((e) => e.id)).toEqual(['a', 'b', 'c']);
      expect(version).toBe(3);
    });

    it('recusa gravação com versão desatualizada sem alterar nada', async () => {
      const store = create();
      await store.append(ref, [event('a')], 0);
      await expect(store.append(ref, [event('b')], 0)).rejects.toThrow(ConcurrencyError);
      expect((await store.read(ref)).version).toBe(1);
    });

    it('streams de rodadas diferentes são independentes', async () => {
      const store = create();
      await store.append(ref, [event('a')], 0);
      expect((await store.read({ ...ref, round: 4 })).version).toBe(0);
      expect((await store.read({ ...ref, division: 'Divisão Júnior' })).version).toBe(0);
    });
  });
};

eventStoreContract('em memória', () => new InMemoryEventStore());
