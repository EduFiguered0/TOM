import type { FileStat, Folder } from '@tom/uploader/core';

interface FileLike {
  getFile(): Promise<File>;
}

/** O pedaço da File System Access API que a pasta usa (só leitura). */
export interface DirectoryLike {
  name: string;
  values(): AsyncIterable<{ kind: 'file' | 'directory'; name: string } & Partial<FileLike>>;
  getFileHandle(name: string): Promise<FileLike>;
}

/** Pasta do TOM escolhida no navegador: só os .html da própria pasta, nunca subpastas nem outro caminho. */
export const browserFolder = (handle: DirectoryLike): Folder => ({
  async list(): Promise<FileStat[]> {
    const stats: FileStat[] = [];
    for await (const entry of handle.values()) {
      if (entry.kind !== 'file' || !entry.name.toLowerCase().endsWith('.html') || !entry.getFile) continue;
      const file = await entry.getFile();
      stats.push({ fileName: entry.name, size: file.size, modifiedAt: new Date(file.lastModified) });
    }
    return stats;
  },
  async read(fileName: string): Promise<string> {
    if (fileName.includes('/') || fileName.includes('\\') || fileName.includes('..')) throw new Error(`Nome de arquivo inválido: ${fileName}`);
    return (await (await handle.getFileHandle(fileName)).getFile()).text();
  },
});
