import type { Lead } from '@tom/landing-core';
import { LeadConflictError, LeadExistsError, type ConsentRecord, type IntentRecord, type LeadRepository } from '../src/lead-repository.js';

/** Repositório em memória com as mesmas regras de unicidade e versão do DynamoDB. */
export class MemoryLeads implements LeadRepository {
  readonly leads = new Map<string, Lead>();
  readonly consents: (ConsentRecord & { leadId: string })[] = [];
  readonly intents: IntentRecord[] = [];
  readonly writes: string[] = [];
  /** Simula outra requisição criando o mesmo lead entre a busca e a criação. */
  raceOnCreate: Lead | null = null;

  findByGoogleSub(storeId: string, googleSub: string): Promise<Lead | null> {
    return Promise.resolve([...this.leads.values()].find((l) => l.storeId === storeId && l.googleSub === googleSub) ?? null);
  }

  create(lead: Lead): Promise<void> {
    if (this.raceOnCreate) {
      this.leads.set(this.raceOnCreate.leadId, this.raceOnCreate);
      this.raceOnCreate = null;
    }
    if ([...this.leads.values()].some((l) => l.storeId === lead.storeId && l.googleSub === lead.googleSub)) return Promise.reject(new LeadExistsError());
    this.leads.set(lead.leadId, lead);
    this.writes.push('lead');
    return Promise.resolve();
  }

  update(lead: Lead, consents: ConsentRecord[]): Promise<void> {
    if (this.leads.get(lead.leadId)?.version !== lead.version - 1) return Promise.reject(new LeadConflictError());
    this.leads.set(lead.leadId, lead);
    this.consents.push(...consents.map((c) => ({ ...c, leadId: lead.leadId })));
    this.writes.push('lead', ...consents.map(() => 'consent'));
    return Promise.resolve();
  }

  latestConsent(_storeId: string, leadId: string, kind: ConsentRecord['kind']): Promise<ConsentRecord | null> {
    const found = this.consents.filter((c) => c.leadId === leadId && c.kind === kind).at(-1);
    if (!found) return Promise.resolve(null);
    return Promise.resolve({ kind: found.kind, version: found.version, sha256: found.sha256, value: found.value, at: found.at });
  }

  addIntent(_storeId: string, intent: IntentRecord): Promise<void> {
    this.intents.push(intent);
    this.writes.push('intent');
    return Promise.resolve();
  }
}
