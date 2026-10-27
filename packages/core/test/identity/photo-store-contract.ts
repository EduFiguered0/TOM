import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { PhotoStore } from '../../src/index.js';

/** Contrato da porta: toda implementação (memória, DynamoDB) deve passar. Ids únicos por execução. */
export const photoStoreContract = (name: string, create: () => PhotoStore) => {
  describe(`PhotoStore: ${name}`, () => {
    it('grava e lê pela chave; chave desconhecida dá null', async () => {
      const store = create();
      const id = randomUUID();
      await store.put(id, 'data:image/png;base64,AAAA');
      expect(await store.get(id)).toBe('data:image/png;base64,AAAA');
      expect(await store.get(randomUUID())).toBeNull();
    });
  });
};
