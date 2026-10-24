import type { RoundRef } from './round-pairing.js';

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
  setCurrent(current: CurrentRound): Promise<void>;
  current(): Promise<CurrentRound | null>;
}

const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

/** Token de 256 bits, em texto seguro para colar no terminal. */
export const newUploadToken = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

export const hashToken = async (token: string): Promise<string> =>
  hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))));
