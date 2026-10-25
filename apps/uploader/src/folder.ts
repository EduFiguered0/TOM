import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type { FileStat, Folder } from './folder-port.js';

export type { FileStat, Folder } from './folder-port.js';

const isMissing = (e: unknown): boolean => (e as NodeJS.ErrnoException).code === 'ENOENT';

export class LocalFolder implements Folder {
  constructor(private readonly dir: string) {}

  async list(): Promise<FileStat[]> {
    const entries = await readdir(this.dir, { withFileTypes: true });
    const stats = await Promise.all(
      entries
        .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.html'))
        .map(async (e) => {
          try {
            const s = await stat(join(this.dir, e.name));
            return { fileName: e.name, size: s.size, modifiedAt: s.mtime };
          } catch (err) {
            if (isMissing(err)) return null; // apagado entre o readdir e o stat
            throw err;
          }
        }),
    );
    return stats.filter((s): s is FileStat => s !== null);
  }

  read(fileName: string): Promise<string> {
    if (basename(fileName) !== fileName) return Promise.reject(new Error(`Nome de arquivo inválido: ${fileName}`));
    return readFile(join(this.dir, fileName), 'utf8');
  }
}
