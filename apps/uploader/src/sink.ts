import type { ReportType } from '@tom/tom-reports';

/** Erro que não se resolve tentando de novo (token revogado, torneio errado): o enviador para e avisa. */
export class FatalSinkError extends Error {
  override name = 'FatalSinkError';
}

/** Uma versão completa de um HTML do TOM, pronta para envio. */
export interface Snapshot {
  tournament: string;
  type: ReportType;
  fileName: string;
  content: string;
  sha256: string;
  modifiedAt: Date;
}

/** Destino dos envios: API com o token do evento (CLI) ou com o login do ADM (navegador). `send` só resolve depois de aceito. */
export interface Sink {
  send(snapshot: Snapshot): Promise<void>;
}
