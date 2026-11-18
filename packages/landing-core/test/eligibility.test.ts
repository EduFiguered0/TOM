import { describe, expect, it } from 'vitest';
import { checkoutDecision } from '../src/eligibility.js';
import type { Lead } from '../src/lead.js';
import { goodgame } from '../src/stores/goodgame.js';

const lead: Lead = {
  leadId: 'l1', storeId: 'goodgame', googleSub: 'g-1', cognitoSub: 'c-1', fullName: 'Ana Souza', email: 'ana@example.com',
  phone: '21998765432', birthDate: '2000-05-10', status: 'COMPLETE', marketingOptIn: false,
  firstTouch: { source: 'instagram', medium: null, campaign: null, content: null, at: '2026-11-17T12:00:00.000Z' },
  createdAt: '2026-11-17T12:00:00.000Z', updatedAt: '2026-11-17T12:00:00.000Z', version: 1,
};
const before = new Date('2026-11-18T12:00:00Z');
const decide = (over: Partial<Parameters<typeof checkoutDecision>[0]> = {}) =>
  checkoutDecision({ lead, acceptedTermsVersion: '1.0', eventId: 'ots-genesys-2026-11-21', config: goodgame, now: before, ...over });

describe('liberação do checkout', () => {
  it('lead completo, termos vigentes e evento aberto: libera', () => {
    expect(decide()).toMatchObject({ ok: true, event: { id: 'ots-genesys-2026-11-21' } });
  });

  it('sem lead ou com cadastro incompleto: bloqueia', () => {
    expect(decide({ lead: null })).toEqual({ ok: false, reason: 'PROFILE_INCOMPLETE' });
    expect(decide({ lead: { ...lead, status: 'INCOMPLETE' } })).toEqual({ ok: false, reason: 'PROFILE_INCOMPLETE' });
  });

  it('sem aceite ou com versão antiga dos termos: bloqueia', () => {
    expect(decide({ acceptedTermsVersion: null })).toEqual({ ok: false, reason: 'TERMS_OUTDATED' });
    expect(decide({ acceptedTermsVersion: '0.9' })).toEqual({ ok: false, reason: 'TERMS_OUTDATED' });
  });

  it('evento desconhecido', () => {
    expect(decide({ eventId: 'evento-x' })).toEqual({ ok: false, reason: 'EVENT_NOT_FOUND' });
  });

  it('venda fecha às 11:00 de Brasília do dia do torneio', () => {
    expect(decide({ now: new Date('2026-11-21T13:59:59Z') }).ok).toBe(true);
    expect(decide({ now: new Date('2026-11-21T14:00:00Z') })).toEqual({ ok: false, reason: 'EVENT_CLOSED' });
    expect(decide({ eventId: 'ots-avancado-2026-11-22', now: new Date('2026-11-21T14:00:00Z') }).ok).toBe(true);
  });

  it('configuração da GoodGame com os dois torneios e o link da LigaMagic', () => {
    expect(goodgame.checkoutUrl).toBe('https://www.ggtcg.com.br/?view=ecom/itens&cat=214899&ing=1');
    expect(goodgame.events.map((e) => [e.id, e.priceCents, e.salesCloseAt])).toEqual([
      ['ots-genesys-2026-11-21', 7500, '2026-11-21T11:00:00-03:00'],
      ['ots-avancado-2026-11-22', 7500, '2026-11-22T11:00:00-03:00'],
    ]);
  });
});
