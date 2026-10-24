/** Formato das requisições e respostas da API, compartilhado entre API e telas. Sem dependências. */

export interface ProfileDto {
  name: string;
  birthYear: number;
  phone: string | null;
  guardianConsent: boolean;
}

export interface RegisterRequest {
  profile: ProfileDto;
  /** Player ID informado pelo jogador; fica pendente até o ADM confirmar no check-in. */
  playerId: string | null;
}

export interface SessionRequest {
  /** true quando o jogador confirmou na tela que este dispositivo substitui o outro. */
  replace: boolean;
}

export interface ConfirmPlayerIdRequest {
  /** Valor conferido presencialmente; pode corrigir o que o jogador informou. */
  playerId: string;
}

/** Conta como o ADM vê no check-in. */
export interface AccountResponse {
  id: string;
  email: string;
  profile: ProfileDto;
  playerId: { value: string; confirmed: boolean } | null;
  createdAt: string;
}

export interface MeResponse extends AccountResponse {
  role: 'player' | 'judge' | 'admin';
  /** false para jogador sem Player ID confirmado: vê a conta, mas ainda não reporta. */
  canAct: boolean;
}

export interface ErrorResponse {
  error: string;
  message: string;
}

export class InvalidRequestError extends Error {
  override name = 'InvalidRequestError';
}

type Json = Record<string, unknown>;

const object = (value: unknown, what: string): Json => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new InvalidRequestError(`${what} deve ser um objeto`);
  return value as Json;
};

interface FieldTypes { string: string; number: number; boolean: boolean }

const field = <K extends keyof FieldTypes>(obj: Json, key: string, type: K): FieldTypes[K] => {
  const value = obj[key];
  if (typeof value === type) return value as FieldTypes[K];
  throw new InvalidRequestError(`Campo "${key}" deve ser ${type}`);
};

const nullableString = (obj: Json, key: string): string | null => (obj[key] === null ? null : field(obj, key, 'string'));

export const parseRegisterRequest = (body: unknown): RegisterRequest => {
  const root = object(body, 'Corpo');
  const profile = object(root['profile'], 'profile');
  return {
    profile: {
      name: field(profile, 'name', 'string'),
      birthYear: field(profile, 'birthYear', 'number'),
      phone: nullableString(profile, 'phone'),
      guardianConsent: field(profile, 'guardianConsent', 'boolean'),
    },
    playerId: nullableString(root, 'playerId'),
  };
};

export const parseConfirmPlayerIdRequest = (body: unknown): ConfirmPlayerIdRequest => ({
  playerId: field(object(body, 'Corpo'), 'playerId', 'string'),
});

export const parseSessionRequest = (body: unknown): SessionRequest => ({
  replace: field(object(body, 'Corpo'), 'replace', 'boolean'),
});

/** Cor do termômetro da mesa (spec, "Termômetro de validação de resultados"). */
export type TableColor = 'gray' | 'orange' | 'green' | 'red';

/** Rodada para a TV do salão: pública, só nomes (sem Player ID nem e-mail). */
export interface BoardResponse {
  tournament: string;
  division: string;
  round: number;
  /** null antes de o ADM iniciar a rodada. */
  startedAt: string | null;
  /** Fim do tempo da rodada (sem acréscimos de mesa). */
  endsAt: string | null;
  tables: { table: number; player1: string; player2: string; color: TableColor }[];
  byes: string[];
  /** Momento em que o servidor montou a resposta; a TV corrige o relógio local por ele. */
  serverTime: string;
}
