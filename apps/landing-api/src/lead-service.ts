import {
  checkoutDecision, LEGAL, statusOf, validProfile, type CheckoutRefusal, type Lead, type ProfileInput, type StoreConfig, type Utm,
} from '@tom/landing-core';
import type { GoogleIdentity } from './identity.js';
import { LeadExistsError, type ConsentRecord, type LeadRepository } from './lead-repository.js';

export type Missing = 'phone' | 'birthDate' | 'terms';

export interface MeView {
  lead: Lead;
  termsAccepted: boolean;
  missing: Missing[];
}

export class LeadNotFoundError extends Error {
  override name = 'LeadNotFoundError';
}

interface Deps {
  repo: LeadRepository;
  config: StoreConfig;
  clock: { now(): Date };
  ids: { next(): string };
}

/** Casos de uso da landing: reconhecer o lead, completar o cadastro e liberar o checkout externo. */
export class LeadService {
  constructor(private readonly deps: Deps) {}

  /** Lead da conta Google nesta loja; cria um incompleto no primeiro acesso, guardando a origem. */
  async me(id: GoogleIdentity, google: { email: string; name: string | null }, utm: Utm): Promise<MeView> {
    const { repo, config, clock, ids } = this.deps;
    const existing = await repo.findByGoogleSub(config.storeId, id.googleSub);
    if (existing) return this.view(existing);
    const at = clock.now().toISOString();
    const lead: Lead = {
      leadId: ids.next(), storeId: config.storeId, googleSub: id.googleSub, cognitoSub: id.cognitoSub,
      fullName: google.name ?? '', email: google.email, phone: null, birthDate: null, status: 'INCOMPLETE', marketingOptIn: false,
      firstTouch: { ...utm, at }, createdAt: at, updatedAt: at, version: 1,
    };
    try {
      await repo.create(lead);
      return await this.view(lead);
    } catch (error) {
      if (!(error instanceof LeadExistsError)) throw error;
      // Outra requisição criou o lead ao mesmo tempo: usa o que ficou gravado.
      const winner = await repo.findByGoogleSub(config.storeId, id.googleSub);
      if (!winner) throw error;
      return this.view(winner);
    }
  }

  /** Completa ou atualiza o cadastro; registra aceite dos termos vigentes e mudança do opt-in de marketing. */
  async update(id: GoogleIdentity, input: ProfileInput): Promise<MeView> {
    const { repo, config, clock } = this.deps;
    const current = await repo.findByGoogleSub(config.storeId, id.googleSub);
    if (!current) throw new LeadNotFoundError();
    const now = clock.now();
    const at = now.toISOString();
    const profile = validProfile(input, now);
    const lead: Lead = { ...current, ...profile, updatedAt: at, version: current.version + 1 };
    lead.status = statusOf(lead);

    const consents: ConsentRecord[] = [];
    if (!(await this.termsAccepted(current))) {
      for (const doc of [LEGAL.terms, LEGAL.privacy]) consents.push({ kind: doc.kind, version: doc.version, sha256: doc.sha256, value: true, at });
    }
    const marketing = await repo.latestConsent(config.storeId, current.leadId, 'marketing');
    if (marketing?.value !== profile.marketingOptIn) {
      consents.push({ kind: 'marketing', version: null, sha256: null, value: profile.marketingOptIn, at });
    }
    await repo.update(lead, consents);
    return this.view(lead);
  }

  /** Valida a elegibilidade no servidor e registra a intenção; o link sai só da configuração. */
  async checkout(id: GoogleIdentity, eventId: string, utm: Utm): Promise<{ ok: true; url: string } | { ok: false; reason: CheckoutRefusal }> {
    const { repo, config, clock, ids } = this.deps;
    const now = clock.now();
    const lead = await repo.findByGoogleSub(config.storeId, id.googleSub);
    const terms = lead ? await repo.latestConsent(config.storeId, lead.leadId, 'terms') : null;
    const decision = checkoutDecision({ lead, acceptedTermsVersion: terms?.value ? terms.version : null, eventId, config, now });
    if (!decision.ok || !lead) return decision.ok ? { ok: false, reason: 'PROFILE_INCOMPLETE' } : decision;
    await repo.addIntent(config.storeId, { intentId: ids.next(), leadId: lead.leadId, eventId: decision.event.id, at: now.toISOString(), utm, status: 'REDIRECTED' }, lead);
    return { ok: true, url: config.checkoutUrl };
  }

  private async termsAccepted(lead: Lead): Promise<boolean> {
    const terms = await this.deps.repo.latestConsent(this.deps.config.storeId, lead.leadId, 'terms');
    return terms?.value === true && terms.version === LEGAL.terms.version;
  }

  private async view(lead: Lead): Promise<MeView> {
    const termsAccepted = await this.termsAccepted(lead);
    const missing: Missing[] = [];
    if (!lead.phone) missing.push('phone');
    if (!lead.birthDate) missing.push('birthDate');
    if (!termsAccepted) missing.push('terms');
    return { lead, termsAccepted, missing };
  }
}
