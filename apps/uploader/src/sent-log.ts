import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

/** Último conteúdo enviado por arquivo; sobrevive a reinícios para só reenviar o que mudou. */
export interface SentLog {
  get(fileName: string): string | undefined;
  set(fileName: string, sha256: string): Promise<void>;
}

export class MemorySentLog implements SentLog {
  private readonly sent = new Map<string, string>();

  get(fileName: string): string | undefined {
    return this.sent.get(fileName);
  }

  set(fileName: string, sha256: string): Promise<void> {
    this.sent.set(fileName, sha256);
    return Promise.resolve();
  }
}

export class JsonFileSentLog implements SentLog {
  private constructor(
    private readonly path: string,
    private readonly sent: Map<string, string>,
  ) {}

  static async open(path: string): Promise<JsonFileSentLog> {
    try {
      const data = JSON.parse(await readFile(path, 'utf8')) as Record<string, string>;
      return new JsonFileSentLog(path, new Map(Object.entries(data)));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
      return new JsonFileSentLog(path, new Map());
    }
  }

  get(fileName: string): string | undefined {
    return this.sent.get(fileName);
  }

  /** Grava em arquivo temporário e renomeia: uma queda no meio não corrompe o registro. */
  async set(fileName: string, sha256: string): Promise<void> {
    this.sent.set(fileName, sha256);
    await mkdir(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.tmp`;
    await writeFile(tmp, JSON.stringify(Object.fromEntries(this.sent), null, 2));
    await rename(tmp, this.path);
  }
}
