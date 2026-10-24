import type { Actor } from '../shared/actor.js';
import type { PlayerId } from '../shared/player-id.js';

/** Dados pessoais guardados (spec, "Dados pessoais e LGPD"). */
export interface Profile {
  name: string;
  birthYear: number;
  phone: string | null;
  /** "Sou o responsável legal por este jogador e autorizo o uso dos dados acima." Obrigatório para menores. */
  guardianConsent: boolean;
}

export interface Account {
  id: string;
  /** E-mail verificado, em minúsculas: uma conta por e-mail. */
  email: string;
  /** Logins do Cognito (`sub`) ligados à conta: código por e-mail, Google. */
  logins: string[];
  profile: Profile;
  /** Informado pelo jogador; só vale para reportar depois que o ADM confirma no check-in. */
  playerId: { value: PlayerId; confirmed: boolean } | null;
  /** Sessão do dispositivo ativo (`origin_jti` do token); tokens de outra sessão são recusados. */
  activeSession: string | null;
  createdAt: Date;
}

export type IdentityEventData =
  | { type: 'account_registered'; login: string }
  | { type: 'login_linked'; login: string }
  | { type: 'player_id_claimed'; playerId: PlayerId }
  | { type: 'player_id_confirmed'; playerId: PlayerId }
  | { type: 'session_activated'; session: string; replaced: string | null };

/** Fato gravado junto com a conta, para auditoria. */
export type IdentityEvent = IdentityEventData & {
  id: string;
  accountId: string;
  at: Date;
  actor: Actor;
};

/** E-mail como chave da conta: sem espaços e em minúsculas. */
export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

export class InvalidProfileError extends Error {
  override name = 'InvalidProfileError';
}

const ADULT_AGE = 18;

/** Normaliza e valida o perfil do cadastro. */
export const validProfile = (input: Profile, now: Date): Profile => {
  const name = input.name.trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 100) throw new InvalidProfileError('Nome deve ter de 2 a 100 caracteres');
  const year = now.getUTCFullYear();
  if (!Number.isInteger(input.birthYear) || input.birthYear < 1900 || input.birthYear > year) {
    throw new InvalidProfileError('Ano de nascimento inválido');
  }
  if (year - input.birthYear < ADULT_AGE && !input.guardianConsent) {
    throw new InvalidProfileError('Menores precisam da autorização do responsável legal');
  }
  const phone = input.phone?.replace(/\D/g, '') || null;
  if (phone && (phone.length < 10 || phone.length > 13)) throw new InvalidProfileError('Telefone inválido');
  return { name, birthYear: input.birthYear, phone, guardianConsent: input.guardianConsent };
};
