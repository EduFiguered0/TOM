import type { RoundRef } from './round-pairing.js';

/**
 * Fases do evento: inscrições abertas (QR na TV) → em andamento (desde a rodada 1; o QR continua aberto) →
 * resultado final do TOM recebido → encerrado. Cancelado em qualquer fase antes de encerrar.
 */
export type EventStatus = 'open' | 'running' | 'final' | 'closed' | 'cancelled';

/** Fases em que o evento é o ativo: só um por vez. */
export const ACTIVE_STATUSES: readonly EventStatus[] = ['open', 'running', 'final'];

/** Linha da classificação final (standings do TOM), para a TV e o histórico. */
export interface FinalStanding {
  division: string;
  rank: number;
  name: string;
  wins: number;
  losses: number;
  ties: number;
  /** Pontos e desempates do TOM (% de vitória dos oponentes e dos oponentes dos oponentes); null em eventos antigos. */
  points: number | null;
  opponentWinPct: number | null;
  opponentsOpponentWinPct: number | null;
}

/** Evento organizado (um dia de torneio). O enviador do notebook do TOM só envia com o token dele. */
export interface TournamentEvent {
  id: string;
  label: string;
  /** Nome do torneio no TOM; fica amarrado no primeiro envio. Envios de outro torneio são recusados. */
  tournament: string | null;
  /** SHA-256 do token: o token em si só aparece uma vez, para o ADM. */
  tokenHash: string;
  revoked: boolean;
  createdAt: Date;
  createdBy: string;
  /** Contas escaladas como juiz neste evento (só juízes da equipe). */
  judges: string[];
  /** Dia do evento (`YYYY-MM-DD`). */
  date: string;
  /** Tempo de rodada usado quando o ADM inicia sem informar outro. */
  roundMinutes: number;
  status: EventStatus;
  /** Código do QR de inscrição (`/e/<código>`); separado do token do enviador. null em eventos antigos. */
  code: string | null;
  /** Classificação final, quando o TOM manda os standings da última rodada. */
  standings: FinalStanding[] | null;
  /** Último standings intermediário do TOM: a TV mostra entre a rodada `round` e o pareamento seguinte. */
  partial: { round: number; standings: FinalStanding[] } | null;
  /** O ADM reexibiu na TV a classificação final deste evento (só o último, já encerrado). */
  onTv: boolean;
}

/** Rodada que as telas mostram agora: a última publicada pelo enviador. */
export interface CurrentRound {
  eventId: string;
  ref: RoundRef;
  updatedAt: Date;
}

/**
 * Porta de persistência dos eventos. `save` falha com ConcurrencyError se a versão mudou
 * (versão esperada 0 = evento novo).
 */
export interface EventRegistry {
  get(id: string): Promise<{ event: TournamentEvent; version: number } | null>;
  findByTokenHash(tokenHash: string): Promise<{ event: TournamentEvent; version: number } | null>;
  save(event: TournamentEvent, expectedVersion: number): Promise<number>;
  /**
   * Evento novo: grava o evento (versão 1), as travas do token e do código e passa a ser o `latest`.
   * Falha com ConcurrencyError se o `latest` não for mais `previousLatest` (outro evento foi criado junto).
   */
  create(event: TournamentEvent, previousLatest: string | null): Promise<void>;
  /** Último evento criado; o ativo é ele, se ainda não foi encerrado nem cancelado. */
  latest(): Promise<{ event: TournamentEvent; version: number } | null>;
  findByCode(code: string): Promise<{ event: TournamentEvent; version: number } | null>;
  setCurrent(current: CurrentRound): Promise<void>;
  current(): Promise<CurrentRound | null>;
}

const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

/** Token de 256 bits, em texto seguro para colar no terminal. */
export const newUploadToken = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Código curto do QR: 8 caracteres sem os que se confundem (0/O, 1/I/L). */
export const newEventCode = (): string =>
  Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');

export const hashToken = async (token: string): Promise<string> =>
  hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))));
