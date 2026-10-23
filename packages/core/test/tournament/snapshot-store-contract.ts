import { createHash, randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { SnapshotIntegrityError, type SnapshotRef, type SnapshotStore, type TomSnapshot } from '../../src/index.js';

const snapshot = (tournament: string, content: string, capturedAt: string, report = 'pairings'): TomSnapshot => ({
  tournament, report, content, capturedAt: new Date(capturedAt),
  sha256: createHash('sha256').update(content).digest('hex'),
});

const refOf = (s: TomSnapshot): SnapshotRef =>
  ({ tournament: s.tournament, report: s.report, capturedAt: s.capturedAt, sha256: s.sha256 });

/**
 * Contrato da porta: toda implementação (memória, S3) deve passar.
 * Cada teste usa um torneio novo, porque implementações reais guardam dados entre execuções.
 */
export const snapshotStoreContract = (name: string, create: () => SnapshotStore) => {
  describe(`SnapshotStore: ${name}`, () => {
    const fresh = () => `teste-${randomUUID()}`;

    it('torneio novo não tem versões', async () => {
      expect(await create().versions(fresh(), 'pairings')).toEqual([]);
    });

    it('grava e devolve o conteúdo exato, inclusive acentos', async () => {
      const store = create();
      const s = snapshot(fresh(), '<html>Divisão Mestre – rodada 3</html>', '2026-10-23T14:00:00.123Z');
      expect(await store.save(s)).toBe(true);
      expect(await store.versions(s.tournament, 'pairings')).toEqual([refOf(s)]);
      expect(await store.load(refOf(s))).toEqual(s);
    });

    it('gravar a mesma versão de novo não duplica', async () => {
      const store = create();
      const s = snapshot(fresh(), '<html>a</html>', '2026-10-23T14:00:00Z');
      await store.save(s);
      expect(await store.save(s)).toBe(false);
      expect(await store.versions(s.tournament, 'pairings')).toHaveLength(1);
    });

    it('versões em ordem cronológica, mesmo gravadas fora de ordem', async () => {
      const store = create();
      const t = fresh();
      const later = snapshot(t, '<html>b</html>', '2026-10-24T09:00:00Z');
      const earlier = snapshot(t, '<html>a</html>', '2026-10-23T23:59:59.999Z');
      await store.save(later);
      await store.save(earlier);
      expect(await store.versions(t, 'pairings')).toEqual([refOf(earlier), refOf(later)]);
    });

    it('relatórios e torneios são independentes', async () => {
      const store = create();
      const s = snapshot(fresh(), '<html>a</html>', '2026-10-23T14:00:00Z', 'standings');
      await store.save(s);
      expect(await store.versions(s.tournament, 'pairings')).toEqual([]);
      expect(await store.versions(fresh(), 'standings')).toEqual([]);
    });

    it('nome de torneio com barra, espaço e acento não escapa da partição', async () => {
      const store = create();
      const base = fresh();
      const s = snapshot(`${base}/../Copa São Paulo`, '<html>a</html>', '2026-10-23T14:00:00Z');
      await store.save(s);
      expect(await store.versions(s.tournament, 'pairings')).toEqual([refOf(s)]);
      expect(await store.versions(base, 'pairings')).toEqual([]);
    });

    it('recusa conteúdo que não bate com o SHA-256, sem gravar nada', async () => {
      const store = create();
      const s = { ...snapshot(fresh(), '<html>a</html>', '2026-10-23T14:00:00Z'), content: '<html>adulterado</html>' };
      await expect(store.save(s)).rejects.toThrow(SnapshotIntegrityError);
      expect(await store.versions(s.tournament, 'pairings')).toEqual([]);
    });

    it('versão inexistente volta null', async () => {
      const s = snapshot(fresh(), '<html>a</html>', '2026-10-23T14:00:00Z');
      expect(await create().load(refOf(s))).toBeNull();
    });
  });
};
