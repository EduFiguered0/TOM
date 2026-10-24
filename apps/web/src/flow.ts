import type { MeResponse, ProfileDto } from '@tom/contracts';
import type { ApiResult } from './api.js';

export type Screen =
  | { name: 'loading' }
  | { name: 'login' }
  | { name: 'register' }
  /** Outro dispositivo está ativo: "entrar aqui desconecta o outro". */
  | { name: 'device' }
  | { name: 'home'; me: MeResponse }
  | { name: 'error'; message: string };

/** Para onde ir depois de consultar a própria conta. */
export const screenFor = (result: ApiResult<MeResponse>): Screen => {
  if (result.ok) return { name: 'home', me: result.body };
  switch (result.error.error) {
    case 'account_not_found': return { name: 'register' };
    case 'session_inactive': return { name: 'device' };
    case 'unauthorized': return { name: 'login' };
    default: return { name: 'error', message: result.error.message };
  }
};

const ADULT_AGE = 18;

/** O formulário só pede a autorização do responsável para menores (mesma regra do servidor). */
export const isMinor = (birthYear: number, today = new Date()) => today.getFullYear() - birthYear < ADULT_AGE;

export interface RegisterForm {
  name: string;
  birthYear: string;
  phone: string;
  playerId: string;
  guardianConsent: boolean;
}

export const toRegisterRequest = (form: RegisterForm): { profile: ProfileDto; playerId: string | null } => ({
  profile: {
    name: form.name.trim(),
    birthYear: Number(form.birthYear),
    phone: form.phone.trim() || null,
    guardianConsent: form.guardianConsent,
  },
  playerId: form.playerId.trim() || null,
});
