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

export interface MeResponse {
  id: string;
  email: string;
  profile: ProfileDto;
  playerId: { value: string; confirmed: boolean } | null;
  role: 'player' | 'judge' | 'admin';
  /** false para jogador sem Player ID confirmado: vê a conta, mas ainda não reporta. */
  canAct: boolean;
  createdAt: string;
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

export const parseSessionRequest = (body: unknown): SessionRequest => ({
  replace: field(object(body, 'Corpo'), 'replace', 'boolean'),
});
