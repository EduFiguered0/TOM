import type { Actor } from '../shared/actor.js';
import type { PlayerId } from '../shared/player-id.js';

/** Dados pessoais guardados (spec, "Dados pessoais e LGPD"). */
export interface Profile {
  /** Nome e sobrenome separados, como o TOM pede. */
  firstName: string;
  lastName: string;
  birthYear: number;
  phone: string | null;
  /** "Sou o responsável legal por este jogador e autorizo o uso dos dados acima." Obrigatório para menores. */
  guardianConsent: boolean;
}

/** Dados do jogador que o ADM pode corrigir (o e-mail é o login e fica de fora). */
export type PlayerField = 'firstName' | 'lastName' | 'birthYear' | 'phone' | 'playerId';

export interface Account {
  id: string;
  /** E-mail verificado, em minúsculas: uma conta por e-mail. */
  email: string;
  /** Logins do Cognito (`sub`) ligados à conta: e-mail e senha, Google. */
  logins: string[];
  /**
   * false = criada com senha: ninguém provou que o e-mail é do dono. Ausente = conta antiga (código por e-mail,
   * e-mail provado). O Google prova o e-mail; ao ligar numa conta não provada, os logins de senha caem.
   */
  emailProven?: boolean;
  profile: Profile;
  /** false = conta antiga, com o nome separado automaticamente no primeiro espaço: a pessoa confere uma vez. */
  nameReviewed: boolean;
  /** Informado pelo jogador; vale desde o cadastro. O primeiro a cadastrar fica com ele. */
  playerId: PlayerId | null;
  /** Juiz da equipe, marcado pelo ADM. Sozinho não dá poder: o juiz só age no evento em que foi escalado. */
  judge?: boolean;
  /** Foto do perfil (chave aleatória, muda a cada troca); ausente/null = sem foto. */
  photoId?: string | null;
  /** Menor: o responsável autoriza mostrar a foto nas mesas (consentimento específico de imagem). */
  imageConsent?: boolean;
  /** Campos que o ADM alterou e o jogador ainda não viu (aviso só informativo); ausente/null = nada a avisar. */
  adminChanges?: PlayerField[] | null;
  /** Sessão do dispositivo ativo (`origin_jti` do token); tokens de outra sessão são recusados. */
  activeSession: string | null;
  createdAt: Date;
}

export type IdentityEventData =
  | { type: 'account_registered'; login: string }
  /** `dropped`: logins de senha retirados porque o Google provou o dono do e-mail. */
  | { type: 'login_linked'; login: string; dropped?: string[] }
  | { type: 'player_id_claimed'; playerId: PlayerId }
  /** O ADM tirou o Player ID da conta (vínculo errado); o dono verdadeiro pode cadastrá-lo. */
  | { type: 'player_id_unlinked'; playerId: PlayerId }
  | { type: 'session_activated'; session: string; replaced: string | null }
  /** O ADM pôs ou tirou a conta da equipe de juízes. */
  | { type: 'judge_set'; judge: boolean }
  /** A própria pessoa conferiu nome e sobrenome. */
  | { type: 'name_confirmed' }
  /** Foto posta, trocada ou tirada (null), pela pessoa ou pelo ADM. */
  | { type: 'photo_set'; photoId: string | null }
  /** Autorização de imagem do responsável (menor) marcada ou desmarcada. */
  | { type: 'image_consent_set'; consent: boolean }
  /** O ADM corrigiu dados do jogador. */
  | { type: 'player_edited'; fields: PlayerField[] }
  /** O jogador viu o aviso das correções do ADM. */
  | { type: 'admin_changes_seen' };

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
const NAME_MAX = 50;

const clean = (text: string) => text.trim().replace(/\s+/g, ' ');

/** Nome completo: nome e sobrenome, sem espaço sobrando quando o sobrenome está vazio (só em dado antigo). */
export const fullName = ({ firstName, lastName }: { firstName: string; lastName: string }): string => `${firstName} ${lastName}`.trim();

/** Nome antigo, de um campo só: separa no primeiro espaço. */
export const splitName = (full: string): { firstName: string; lastName: string } => {
  const [firstName = '', ...rest] = clean(full).split(' ');
  return { firstName, lastName: rest.join(' ') };
};

/** Normaliza e valida nome e sobrenome. */
export const validName = (input: { firstName: string; lastName: string }): { firstName: string; lastName: string } => {
  const firstName = clean(input.firstName);
  const lastName = clean(input.lastName);
  if (firstName.length < 1 || firstName.length > NAME_MAX) throw new InvalidProfileError('Nome deve ter de 1 a 50 caracteres');
  if (lastName.length < 1 || lastName.length > NAME_MAX) throw new InvalidProfileError('Sobrenome deve ter de 1 a 50 caracteres');
  return { firstName, lastName };
};

/** Normaliza e valida o perfil do cadastro. */
export const validProfile = (input: Profile, now: Date): Profile => {
  const { firstName, lastName } = validName(input);
  const year = now.getUTCFullYear();
  if (!Number.isInteger(input.birthYear) || input.birthYear < 1900 || input.birthYear > year) {
    throw new InvalidProfileError('Ano de nascimento inválido');
  }
  if (year - input.birthYear < ADULT_AGE && !input.guardianConsent) {
    throw new InvalidProfileError('Menores precisam da autorização do responsável legal');
  }
  const phone = input.phone?.replace(/\D/g, '') || null;
  if (phone && (phone.length < 10 || phone.length > 13)) throw new InvalidProfileError('Telefone inválido');
  return { firstName, lastName, birthYear: input.birthYear, phone, guardianConsent: input.guardianConsent };
};
