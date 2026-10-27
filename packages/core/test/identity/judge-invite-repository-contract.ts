import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { JudgeInvite, JudgeInviteRepository } from '../../src/index.js';

const at = new Date('2026-10-27T14:00:00Z');

/** Códigos únicos por execução: implementações reais guardam dados entre execuções. */
const invite = (minutes = 15): JudgeInvite => ({
  code: randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase(),
  createdBy: 'adm', createdAt: at, expiresAt: new Date(at.getTime() + minutes * 60_000), usedBy: null, cancelled: false,
});

/** Contrato da porta: toda implementação (memória, DynamoDB) deve passar. */
export const judgeInviteRepositoryContract = (name: string, create: () => JudgeInviteRepository) => {
  describe(`JudgeInviteRepository: ${name}`, () => {
    it('grava, lê e lista', async () => {
      const repo = create();
      const i = invite();
      await repo.create(i);
      expect(await repo.get(i.code)).toEqual(i);
      expect(await repo.get('NAOEXISTE1')).toBeNull();
      expect((await repo.listAll()).map((x) => x.code)).toContain(i.code);
    });

    it('uso único: o segundo uso falha, mesmo ao mesmo tempo', async () => {
      const repo = create();
      const i = invite();
      await repo.create(i);
      const results = await Promise.all([repo.markUsed(i.code, 'a1', at), repo.markUsed(i.code, 'a2', at)]);
      expect(results.filter(Boolean)).toHaveLength(1);
      expect((await repo.get(i.code))?.usedBy).toMatch(/^a[12]$/);
      expect(await repo.markUsed(i.code, 'a3', at)).toBe(false);
    });

    it('vencido ou cancelado não é usado', async () => {
      const repo = create();
      const [late, gone] = [invite(15), invite(15)];
      await repo.create(late);
      await repo.create(gone);
      expect(await repo.markUsed(late.code, 'a1', new Date(at.getTime() + 15 * 60_000))).toBe(false);
      await repo.cancel(gone.code);
      expect((await repo.get(gone.code))?.cancelled).toBe(true);
      expect(await repo.markUsed(gone.code, 'a1', at)).toBe(false);
      expect(await repo.markUsed('NAOEXISTE1', 'a1', at)).toBe(false);
    });
  });
};
