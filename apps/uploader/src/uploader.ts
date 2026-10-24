import { createHash } from 'node:crypto';
import type { Clock } from '@tom/core';
import { latestTournament, type ReportType } from '@tom/tom-reports';
import type { Folder } from './folder.js';
import type { SentLog } from './sent-log.js';
import { FatalSinkError } from './http-sink.js';
import type { Sink } from './sink.js';

export const DEFAULT_QUIET_MS = 1500;

export interface UploaderDeps {
  folder: Folder;
  sink: Sink;
  sentLog: SentLog;
  clock: Clock;
  quietMs?: number;
  log?: (message: string) => void;
}

interface Tracked {
  size: number;
  modifiedAt: number;
  /** Desde quando o arquivo está sem mudar. */
  quietSince: number;
  done: boolean;
}

/** Todo HTML do TOM termina assim; sem isso o arquivo ainda está sendo escrito. */
export const looksComplete = (html: string): boolean => /<\/html>\s*$/i.test(html);

const sha256 = (content: string): string => createHash('sha256').update(content).digest('hex');

/**
 * A cada `tick`, olha o evento mais recente da pasta e envia cada arquivo
 * que ficou quieto por `quietMs` e está completo. Conteúdo já enviado não é reenviado.
 */
export class Uploader {
  private readonly tracked = new Map<string, Tracked>();
  private current: string | null = null;
  private readonly quietMs: number;
  private readonly log: (message: string) => void;

  constructor(private readonly deps: UploaderDeps) {
    this.quietMs = deps.quietMs ?? DEFAULT_QUIET_MS;
    this.log = deps.log ?? (() => undefined);
  }

  async tick(): Promise<void> {
    const files = await this.deps.folder.list();
    const latest = latestTournament(files);
    if (!latest) return;
    if (latest.tournament !== this.current) {
      this.current = latest.tournament;
      this.log(`evento atual: "${latest.tournament}"`);
    }
    const now = this.deps.clock.now().getTime();
    for (const [type, fileName] of Object.entries(latest.files) as [ReportType, string][]) {
      const stat = files.find((f) => f.fileName === fileName);
      if (stat) await this.check(latest.tournament, type, fileName, stat.size, stat.modifiedAt, now);
    }
  }

  private async check(tournament: string, type: ReportType, fileName: string, size: number, modifiedAt: Date, now: number) {
    const prev = this.tracked.get(fileName);
    if (!prev || prev.size !== size || prev.modifiedAt !== modifiedAt.getTime()) {
      this.tracked.set(fileName, { size, modifiedAt: modifiedAt.getTime(), quietSince: now, done: false });
      return;
    }
    if (prev.done || now - prev.quietSince < this.quietMs) return;

    const content = await this.deps.folder.read(fileName);
    if (!looksComplete(content)) {
      prev.quietSince = now;
      this.log(`${fileName}: incompleto, aguardando o TOM terminar de escrever`);
      return;
    }
    const hash = sha256(content);
    if (this.deps.sentLog.get(fileName) === hash) {
      prev.done = true;
      return;
    }
    try {
      await this.deps.sink.send({ tournament, type, fileName, content, sha256: hash, modifiedAt });
      await this.deps.sentLog.set(fileName, hash);
      prev.done = true;
    } catch (e) {
      if (e instanceof FatalSinkError) throw e;
      prev.quietSince = now;
      this.log(`${fileName}: falha no envio (${e instanceof Error ? e.message : String(e)}); nova tentativa em seguida`);
    }
  }
}
