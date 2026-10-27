import type { PlayerId } from '../shared/player-id.js';
import type { EventStatus } from './tournament-event.js';

/**
 * Inscrição de uma conta no evento: monta a lista que o ADM digita no TOM. Não controla o reporte
 * (quem reporta é quem está nas guias do TOM). Nome, Player ID e ano ficam copiados da conta na inscrição.
 */
export interface Registration {
  eventId: string;
  accountId: string;
  playerId: PlayerId;
  firstName: string;
  lastName: string;
  birthYear: number;
  at: Date;
  /** Pelo QR ou à mão pelo ADM (atrasado, sem celular). */
  by: 'self' | 'admin';
  /** Entrou pelo QR depois do início da rodada 1: espera o ADM aprovar (recusar = remover). */
  awaitingApproval: boolean;
  /** O ADM já digitou no TOM. */
  launched: boolean;
  /** Removida pelo ADM: só ele inscreve de novo. */
  removed: boolean;
  /** Pagou a inscrição (o ADM marca até o encerramento). Não bloqueia nada; só o ADM vê. */
  paid: boolean;
}

/** O evento saiu do status exigido antes de a inscrição ser gravada (ex.: o TOM mandou o resultado final). */
export class EventStatusChangedError extends Error {
  override name = 'EventStatusChangedError';
}

/** Porta de persistência das inscrições. */
export interface RegistrationRepository {
  /** Na ordem de inscrição. */
  list(eventId: string): Promise<Registration[]>;
  get(eventId: string, accountId: string): Promise<Registration | null>;
  /** Grava (ou regrava). Com `guard`, só grava se o evento ainda estiver nesse status; senão EventStatusChangedError. */
  put(registration: Registration, guard: EventStatus | null): Promise<void>;
  /** Inscrições de uma conta em todos os eventos (histórico do jogador), em qualquer ordem. */
  listByAccount(accountId: string): Promise<Registration[]>;
}

export const byInscription = (a: Registration, b: Registration) =>
  a.at.getTime() - b.at.getTime() || a.accountId.localeCompare(b.accountId);
