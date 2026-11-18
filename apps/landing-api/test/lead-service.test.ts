import { goodgame, LEGAL, type Lead, type ProfileInput, type Utm } from '@tom/landing-core';
import { describe, expect, it } from 'vitest';
import { LeadNotFoundError, LeadService } from '../src/lead-service.js';
import { MemoryLeads } from './fakes.js';

const NOW = new Date('2026-11-18T12:00:00Z');
const id = { cognitoSub: 'c-1', googleSub: 'g-1' };
const google = { email: 'ana@example.com', name: 'Ana Souza' };
const instagram: Utm = { source: 'instagram', medium: 'paid', campaign: 'ots', content: null };
const direct: Utm = { source: 'direct', medium: null, campaign: null, content: null };
const profile: ProfileInput = { fullName: 'Ana Souza', phone: '21998765432', birthDate: '2000-05-10', acceptTerms: true, marketingOptIn: true };

const setup = () => {
  const repo = new MemoryLeads();
  let n = 0;
  const service = new LeadService({ repo, config: goodgame, clock: { now: () => NOW }, ids: { next: () => `id-${String(++n)}` } });
  return { repo, service };
};

describe('lead da landing', () => {
  it('primeiro acesso cria lead incompleto com dados do Google e a origem', async () => {
    const { service } = setup();
    const view = await service.me(id, google, instagram);
    expect(view.lead).toMatchObject({ storeId: 'goodgame', googleSub: 'g-1', fullName: 'Ana Souza', email: 'ana@example.com', status: 'INCOMPLETE', version: 1 });
    expect(view.lead.firstTouch).toMatchObject({ source: 'instagram', campaign: 'ots' });
    expect(view.missing).toEqual(['phone', 'birthDate', 'terms']);
  });

  it('reconhece quem já tem cadastro: mesmo lead e mesma primeira origem', async () => {
    const { service, repo } = setup();
    const first = await service.me(id, google, instagram);
    const again = await service.me(id, { ...google, email: 'outro@example.com' }, direct);
    expect(again.lead.leadId).toBe(first.lead.leadId);
    expect(again.lead.firstTouch.source).toBe('instagram');
    expect(repo.leads.size).toBe(1);
  });

  it('dois primeiros acessos ao mesmo tempo não duplicam o lead', async () => {
    const { service, repo } = setup();
    const other: Lead = { ...(await setup().service.me(id, google, direct)).lead, leadId: 'outro' };
    repo.raceOnCreate = other;
    expect((await service.me(id, google, instagram)).lead.leadId).toBe('outro');
    expect(repo.leads.size).toBe(1);
  });

  it('cadastro completo registra termos e política (versão e hash) e o marketing', async () => {
    const { service, repo } = setup();
    await service.me(id, google, instagram);
    const view = await service.update(id, profile);
    expect(view.lead).toMatchObject({ status: 'COMPLETE', phone: '21998765432', birthDate: '2000-05-10', marketingOptIn: true, version: 2 });
    expect(view.missing).toEqual([]);
    expect(repo.consents.map(({ kind, version, sha256, value }) => ({ kind, version, sha256, value }))).toEqual([
      { kind: 'terms', version: LEGAL.terms.version, sha256: LEGAL.terms.sha256, value: true },
      { kind: 'privacy', version: LEGAL.privacy.version, sha256: LEGAL.privacy.sha256, value: true },
      { kind: 'marketing', version: null, sha256: null, value: true },
    ]);
  });

  it('atualizar sem mudar o aceite não repete o histórico', async () => {
    const { service, repo } = setup();
    await service.me(id, google, instagram);
    await service.update(id, profile);
    await service.update(id, { ...profile, phone: '21987654321' });
    expect(repo.consents).toHaveLength(3);
  });

  it('cadastro sem lead criado antes', async () => {
    const { service } = setup();
    await expect(service.update(id, profile)).rejects.toBeInstanceOf(LeadNotFoundError);
  });

  it('cadastro incompleto não libera o link nem grava intenção', async () => {
    const { service, repo } = setup();
    await service.me(id, google, instagram);
    expect(await service.checkout(id, 'ots-genesys-2026-11-21', instagram)).toEqual({ ok: false, reason: 'PROFILE_INCOMPLETE' });
    expect(repo.intents).toHaveLength(0);
  });

  it('elegível: grava a intenção ligada ao lead e ao evento e devolve o link configurado', async () => {
    const { service, repo } = setup();
    const { lead } = await service.me(id, google, instagram);
    await service.update(id, profile);
    expect(await service.checkout(id, 'ots-avancado-2026-11-22', instagram)).toEqual({ ok: true, url: goodgame.checkoutUrl });
    expect(repo.intents).toEqual([{ intentId: expect.any(String) as string, leadId: lead.leadId, eventId: 'ots-avancado-2026-11-22', at: NOW.toISOString(), utm: instagram, status: 'REDIRECTED' }]);
    expect(repo.writes.some((w) => w.includes('purchase'))).toBe(false);
  });
});
