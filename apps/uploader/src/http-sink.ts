import type { ErrorResponse, UploadRequest, UploadResponse } from '@tom/contracts';
import { FatalSinkError, type Sink, type Snapshot } from './sink.js';

export { FatalSinkError };

/** Envia cada versão para a API com o token do evento; só resolve depois do "ok" da API. */
export class HttpSink implements Sink {
  private readonly url: URL;

  constructor(
    api: string,
    private readonly token: string,
    private readonly log: (message: string) => void,
    private readonly fetchFn: typeof fetch = (...args) => fetch(...args),
  ) {
    this.url = new URL('uploads', api.endsWith('/') ? api : `${api}/`);
  }

  async send(s: Snapshot): Promise<void> {
    const request: UploadRequest = {
      tournament: s.tournament,
      report: s.type,
      fileName: s.fileName,
      content: s.content,
      sha256: s.sha256,
      modifiedAt: s.modifiedAt.toISOString(),
    };
    let response: Response;
    try {
      response = await this.fetchFn(this.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-upload-token': this.token },
        body: JSON.stringify(request),
      });
    } catch {
      throw new Error('sem conexão com a API');
    }
    const body = (await response.json().catch(() => ({}))) as Partial<UploadResponse & ErrorResponse>;
    if (response.status === 401) throw new FatalSinkError('token do evento inválido ou revogado; gere um novo token na tela do ADM');
    if (body.error === 'tournament_mismatch') throw new FatalSinkError(`${body.message ?? ''}; crie um evento novo na tela do ADM`);
    if (!response.ok) throw new Error(`API respondeu ${String(response.status)}: ${body.message ?? 'sem detalhes'}`);

    const published = (body.published ?? []).map((p) => `rodada ${String(p.round)} (${p.division})`).join(', ');
    this.log(`enviado ${s.fileName}: ${published ? `publicada ${published}` : body.stored === false ? 'versão já recebida' : body.note ?? 'guardado'}`);
  }
}
