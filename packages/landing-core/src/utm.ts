import type { Utm } from './lead.js';

const MAX = 64;
type Raw = Partial<Record<'utm_source' | 'utm_medium' | 'utm_campaign' | 'utm_content', unknown>>;

/** Só `[a-z0-9._-]`, até 64 caracteres; valor que não é texto ou fica vazio vira null. */
const clean = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const text = value.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, MAX);
  return text || null;
};

/** Origem informada no link do anúncio; nunca recusa o acesso, só limpa. */
export const cleanUtm = (raw: Raw): Utm => ({
  source: clean(raw.utm_source) ?? 'direct',
  medium: clean(raw.utm_medium),
  campaign: clean(raw.utm_campaign),
  content: clean(raw.utm_content),
});
