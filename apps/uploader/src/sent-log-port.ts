/** Último conteúdo enviado por arquivo; sobrevive a reinícios para só reenviar o que mudou. Assíncrono: no navegador é o IndexedDB. */
export interface SentLog {
  get(fileName: string): Promise<string | undefined>;
  set(fileName: string, sha256: string): Promise<void>;
}
