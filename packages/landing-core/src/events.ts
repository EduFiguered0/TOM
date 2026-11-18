/** Torneio à venda pela landing. */
export interface StoreEvent {
  id: string;
  name: string;
  /** AAAA-MM-DD. */
  date: string;
  /** HH:MM, horário de Brasília. */
  time: string;
  priceCents: number;
  location: string;
  /** Caminho da arte no site. */
  image: string;
  /** Depois disso a landing não libera mais o link (ISO com fuso). */
  salesCloseAt: string;
}

/** Configuração da loja: eventos e link de compra externo (só o servidor devolve o link). */
export interface StoreConfig {
  storeId: string;
  storeName: string;
  checkoutUrl: string;
  events: StoreEvent[];
}

export const isClosed = (event: StoreEvent, now: Date): boolean => now.getTime() >= new Date(event.salesCloseAt).getTime();
