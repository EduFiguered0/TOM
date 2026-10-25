import type { ReportFileInfo } from '@tom/tom-reports/files';

export interface FileStat extends ReportFileInfo {
  size: number;
}

/** Acesso somente leitura à pasta do TOM. */
export interface Folder {
  list(): Promise<FileStat[]>;
  read(fileName: string): Promise<string>;
}
