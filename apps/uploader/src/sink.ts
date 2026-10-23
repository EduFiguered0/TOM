import type { ReportType } from '@tom/tom-reports';

/** Uma versão completa de um HTML do TOM, pronta para envio. */
export interface Snapshot {
  tournament: string;
  type: ReportType;
  fileName: string;
  content: string;
  sha256: string;
  modifiedAt: Date;
}

/** Destino dos envios. Fase 10: API com token do evento. `send` só resolve depois de aceito. */
export interface Sink {
  send(snapshot: Snapshot): Promise<void>;
}
