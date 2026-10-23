export class TomParseError extends Error {
  override name = 'TomParseError';
}

/** Arquivos do TOM que não descrevem o mesmo momento (ex.: guias de uma rodada, pareamento de outra). */
export class InconsistentReportsError extends Error {
  override name = 'InconsistentReportsError';
}
