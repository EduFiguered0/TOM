import { isClosed, type StoreConfig, type StoreEvent } from './events.js';
import type { Lead } from './lead.js';
import { LEGAL } from './legal.js';

export type CheckoutRefusal = 'PROFILE_INCOMPLETE' | 'TERMS_OUTDATED' | 'EVENT_NOT_FOUND' | 'EVENT_CLOSED';

interface Input {
  lead: Lead | null;
  /** Última versão dos termos aceita pelo lead. */
  acceptedTermsVersion: string | null;
  eventId: string;
  config: StoreConfig;
  now: Date;
}

/** Decide no servidor se o lead pode ir para a compra externa. */
export const checkoutDecision = ({ lead, acceptedTermsVersion, eventId, config, now }: Input):
  { ok: true; event: StoreEvent } | { ok: false; reason: CheckoutRefusal } => {
  const event = config.events.find((e) => e.id === eventId);
  if (!event) return { ok: false, reason: 'EVENT_NOT_FOUND' };
  if (isClosed(event, now)) return { ok: false, reason: 'EVENT_CLOSED' };
  if (lead?.status !== 'COMPLETE') return { ok: false, reason: 'PROFILE_INCOMPLETE' };
  if (acceptedTermsVersion !== LEGAL.terms.version) return { ok: false, reason: 'TERMS_OUTDATED' };
  return { ok: true, event };
};
