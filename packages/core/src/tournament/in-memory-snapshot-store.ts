import { assertSnapshotIntegrity, type SnapshotRef, type SnapshotStore, type TomSnapshot } from './snapshot-store.js';

const versionKey = (ref: SnapshotRef) => `${ref.capturedAt.toISOString()}#${ref.sha256}`;
const reportKey = (tournament: string, report: string) => JSON.stringify([tournament, report]);

/** Implementação de referência da porta; usada em testes e desenvolvimento local. */
export class InMemorySnapshotStore implements SnapshotStore {
  private readonly reports = new Map<string, Map<string, TomSnapshot>>();

  async save(snapshot: TomSnapshot): Promise<boolean> {
    await assertSnapshotIntegrity(snapshot);
    const id = reportKey(snapshot.tournament, snapshot.report);
    const versions = this.reports.get(id) ?? new Map<string, TomSnapshot>();
    const key = versionKey(snapshot);
    if (versions.has(key)) return false;
    versions.set(key, Object.freeze({ ...snapshot }));
    this.reports.set(id, versions);
    return true;
  }

  versions(tournament: string, report: string): Promise<SnapshotRef[]> {
    const versions = this.reports.get(reportKey(tournament, report)) ?? new Map<string, TomSnapshot>();
    const refs = [...versions.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, s]) => ({ tournament: s.tournament, report: s.report, capturedAt: s.capturedAt, sha256: s.sha256 }));
    return Promise.resolve(refs);
  }

  load(ref: SnapshotRef): Promise<TomSnapshot | null> {
    return Promise.resolve(this.reports.get(reportKey(ref.tournament, ref.report))?.get(versionKey(ref)) ?? null);
  }
}
