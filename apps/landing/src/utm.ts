import { cleanUtm, type Utm } from '@tom/landing-core';

export interface UtmStore {
  get(): string | null;
  set(value: string): void;
}

const KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'] as const;

/** Origem do anúncio: guardada na chegada para sobreviver à ida ao Google; sem nada, acesso direto. */
export const captureUtm = (search: string, store: UtmStore): Utm => {
  const params = new URLSearchParams(search);
  if (KEYS.some((k) => params.has(k))) {
    const utm = cleanUtm(Object.fromEntries(KEYS.map((k) => [k, params.get(k)])));
    store.set(JSON.stringify(utm));
    return utm;
  }
  try {
    const saved: unknown = JSON.parse(store.get() ?? 'null');
    if (saved && typeof saved === 'object') {
      const s = saved as Partial<Utm>;
      return cleanUtm({ utm_source: s.source, utm_medium: s.medium, utm_campaign: s.campaign, utm_content: s.content });
    }
  } catch { /* guardado inválido: acesso direto */ }
  return cleanUtm({});
};

/** Formato aceito pelo POST /checkout e pela query do GET /me. */
export const utmParams = (utm: Utm): Record<string, string> => {
  const params: Record<string, string> = { utm_source: utm.source };
  if (utm.medium) params['utm_medium'] = utm.medium;
  if (utm.campaign) params['utm_campaign'] = utm.campaign;
  if (utm.content) params['utm_content'] = utm.content;
  return params;
};
