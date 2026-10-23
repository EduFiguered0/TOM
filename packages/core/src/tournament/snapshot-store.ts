/** Uma versão completa de um HTML do TOM (fotografia do estado). */
export interface TomSnapshot {
  tournament: string;
  /** Tipo do relatório, ex.: pairings, standings. */
  report: string;
  capturedAt: Date;
  /** SHA-256 do conteúdo em hexadecimal minúsculo. */
  sha256: string;
  content: string;
}

export type SnapshotRef = Omit<TomSnapshot, 'content'>;

export class SnapshotIntegrityError extends Error {
  override name = 'SnapshotIntegrityError';
}

/** Porta de armazenamento das fotografias. Gravar é idempotente; as versões voltam em ordem cronológica. */
export interface SnapshotStore {
  /** true se a versão é nova; false se já estava gravada. */
  save(snapshot: TomSnapshot): Promise<boolean>;
  versions(tournament: string, report: string): Promise<SnapshotRef[]>;
  load(ref: SnapshotRef): Promise<TomSnapshot | null>;
}

const SHA256 = /^[0-9a-f]{64}$/;

/** Recusa fotografia sem torneio/relatório, com data inválida ou cujo SHA-256 não bate com o conteúdo. */
export const assertSnapshotIntegrity = async (snapshot: TomSnapshot): Promise<void> => {
  if (!snapshot.tournament.trim() || !snapshot.report.trim()) {
    throw new SnapshotIntegrityError('Torneio e relatório são obrigatórios');
  }
  if (Number.isNaN(snapshot.capturedAt.getTime())) throw new SnapshotIntegrityError('Data inválida');
  if (!SHA256.test(snapshot.sha256) || (await sha256Hex(snapshot.content)) !== snapshot.sha256) {
    throw new SnapshotIntegrityError('SHA-256 não confere com o conteúdo');
  }
};

const sha256Hex = async (content: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
};
