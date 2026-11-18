export type LeadStatus = 'INCOMPLETE' | 'COMPLETE';

/** Origem do acesso (UTM), já limpa. Sem UTM, `source` é `direct`. */
export interface Utm {
  source: string;
  medium: string | null;
  campaign: string | null;
  content: string | null;
}

/** Pessoa interessada em um ingresso, uma por loja, identificada pela conta Google (`sub`), nunca só pelo e-mail. */
export interface Lead {
  leadId: string;
  storeId: string;
  googleSub: string;
  cognitoSub: string;
  fullName: string;
  /** Verificado pelo Google. */
  email: string;
  /** Só dígitos, com DDD. */
  phone: string | null;
  /** AAAA-MM-DD. */
  birthDate: string | null;
  status: LeadStatus;
  marketingOptIn: boolean;
  /** Primeira origem registrada; não muda depois. */
  firstTouch: Utm & { at: string };
  createdAt: string;
  updatedAt: string;
  /** Controle de concorrência otimista. */
  version: number;
}

/** O que a pessoa informa no cadastro complementar. CPF não é pedido nem guardado. */
export interface ProfileInput {
  fullName: string;
  phone: string;
  birthDate: string;
  acceptTerms: boolean;
  marketingOptIn: boolean;
}

export class InvalidLeadError extends Error {
  override name = 'InvalidLeadError';

  constructor(readonly field: keyof ProfileInput, message: string) {
    super(message);
  }
}

/** LGPD, art. 14: abaixo disso seria preciso o consentimento específico do responsável, que a landing não coleta. */
const MIN_AGE = 12;

const validName = (raw: string): string => {
  const name = raw.trim().replace(/\s+/g, ' ');
  if (name.length < 3 || name.length > 100 || name.split(' ').length < 2) {
    throw new InvalidLeadError('fullName', 'Informe nome e sobrenome.');
  }
  return name;
};

/** Brasil: DDD de 11 a 99; 10 dígitos (fixo) ou 11 começando por 9 depois do DDD (celular). */
const validPhone = (raw: string): string => {
  const phone = raw.replace(/\D/g, '');
  const ddd = Number(phone.slice(0, 2));
  const ok = ddd >= 11 && (phone.length === 10 || (phone.length === 11 && phone[2] === '9'));
  if (!ok) throw new InvalidLeadError('phone', 'Informe um telefone válido com DDD.');
  return phone;
};

const ageAt = (birth: Date, now: Date): number => {
  const age = now.getUTCFullYear() - birth.getUTCFullYear();
  const beforeBirthday = now.getUTCMonth() < birth.getUTCMonth()
    || (now.getUTCMonth() === birth.getUTCMonth() && now.getUTCDate() < birth.getUTCDate());
  return beforeBirthday ? age - 1 : age;
};

const validBirthDate = (raw: string, now: Date): string => {
  const invalid = () => new InvalidLeadError('birthDate', 'Informe uma data de nascimento válida.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw invalid();
  const date = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== raw) throw invalid();
  if (date.getUTCFullYear() < 1900 || date > now) throw invalid();
  if (ageAt(date, now) < MIN_AGE) {
    throw new InvalidLeadError('birthDate', 'Menores de 12 anos: o cadastro deve ser feito pelo responsável, em nome dele.');
  }
  return raw;
};

/** Valida e normaliza o cadastro complementar (mesma regra no site e na API). */
export const validProfile = (input: ProfileInput, now: Date): Omit<ProfileInput, 'acceptTerms'> => {
  const fullName = validName(input.fullName);
  const phone = validPhone(input.phone);
  const birthDate = validBirthDate(input.birthDate, now);
  if (!input.acceptTerms) throw new InvalidLeadError('acceptTerms', 'É preciso aceitar os Termos de Uso e a Política de Privacidade.');
  return { fullName, phone, birthDate, marketingOptIn: input.marketingOptIn };
};

export const statusOf = (lead: Pick<Lead, 'fullName' | 'phone' | 'birthDate'>): LeadStatus =>
  lead.fullName && lead.phone && lead.birthDate ? 'COMPLETE' : 'INCOMPLETE';
