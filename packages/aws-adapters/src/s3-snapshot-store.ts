import {
  GetObjectCommand,
  NoSuchKey,
  paginateListObjectsV2,
  PutObjectCommand,
  S3ServiceException,
  type S3Client,
} from '@aws-sdk/client-s3';
import { assertSnapshotIntegrity, type SnapshotRef, type SnapshotStore, type TomSnapshot } from '@tom/core';

/** Codifica um segmento da chave: barra, ponto e acentos nunca viram estrutura de pasta. */
const segment = (value: string) => encodeURIComponent(value).replace(/\./g, '%2E');

const prefixOf = (tournament: string, report: string) => `${segment(tournament)}/${segment(report)}/`;

/** torneio/relatório/AAAA-MM-DD/HH-mm-ss.SSSZ-sha256.html: ordem alfabética = ordem cronológica. */
const keyOf = (ref: SnapshotRef) => {
  const [date, time] = ref.capturedAt.toISOString().split('T') as [string, string];
  return `${prefixOf(ref.tournament, ref.report)}${date}/${time.replaceAll(':', '-')}-${ref.sha256}.html`;
};

const VERSION = /^(\d{4}-\d{2}-\d{2})\/(\d{2})-(\d{2})-(\d{2}\.\d{3}Z)-([0-9a-f]{64})\.html$/;

/** Fotografias dos HTMLs do TOM no S3, particionadas por torneio, relatório e data. */
export class S3SnapshotStore implements SnapshotStore {
  constructor(private readonly client: S3Client, private readonly bucket: string) {}

  async save(snapshot: TomSnapshot): Promise<boolean> {
    await assertSnapshotIntegrity(snapshot);
    try {
      await this.client.send(new PutObjectCommand({
        Bucket: this.bucket,
        Key: keyOf(snapshot),
        Body: snapshot.content,
        ContentType: 'text/html; charset=utf-8',
        // O S3 confere o hash de novo no recebimento.
        ChecksumSHA256: Buffer.from(snapshot.sha256, 'hex').toString('base64'),
        // Escrita condicional: nunca sobrescreve uma versão já gravada.
        IfNoneMatch: '*',
      }));
      return true;
    } catch (error) {
      if (error instanceof S3ServiceException && error.$metadata.httpStatusCode === 412) return false;
      throw error;
    }
  }

  async versions(tournament: string, report: string): Promise<SnapshotRef[]> {
    const prefix = prefixOf(tournament, report);
    const refs: SnapshotRef[] = [];
    for await (const page of paginateListObjectsV2({ client: this.client }, { Bucket: this.bucket, Prefix: prefix })) {
      for (const { Key } of page.Contents ?? []) {
        const match = VERSION.exec(Key?.slice(prefix.length) ?? '');
        if (!match) continue;
        const [, date, hh, mm, rest, sha256] = match as unknown as [string, string, string, string, string, string];
        refs.push({ tournament, report, capturedAt: new Date(`${date}T${hh}:${mm}:${rest}`), sha256 });
      }
    }
    return refs;
  }

  async load(ref: SnapshotRef): Promise<TomSnapshot | null> {
    try {
      const { Body } = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: keyOf(ref) }));
      const content = (await Body?.transformToString('utf-8')) ?? '';
      return { ...ref, content };
    } catch (error) {
      if (error instanceof NoSuchKey) return null;
      throw error;
    }
  }
}
