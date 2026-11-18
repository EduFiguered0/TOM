import { goodgame } from '@tom/landing-core';
import { describe, expect, it } from 'vitest';
import { createLandingApi, type ApiRequest } from '../src/api.js';
import { GoogleOnlyError } from '../src/identity.js';
import { LeadService } from '../src/lead-service.js';
import { MemoryLeads } from './fakes.js';

const profile = { fullName: 'Ana Souza', phone: '21998765432', birthDate: '2000-05-10', acceptTerms: true, marketingOptIn: false };

interface CallOptions { token?: string | null; body?: unknown; query?: Record<string, string> }

const setup = (now = new Date('2026-11-18T12:00:00Z')) => {
  const repo = new MemoryLeads();
  const errors: unknown[] = [];
  const api = createLandingApi({
    verifier: {
      verify: (token) => {
        if (token === 'ok') return Promise.resolve({ cognitoSub: 'c-1', googleSub: 'g-1' });
        if (token === 'senha') return Promise.reject(new GoogleOnlyError());
        return Promise.reject(new Error('token inválido'));
      },
    },
    profiles: { profile: () => Promise.resolve({ email: 'ana@example.com', name: 'Ana Souza' }) },
    service: new LeadService({ repo, config: goodgame, clock: { now: () => now }, ids: { next: () => 'x1' } }),
    config: goodgame,
    now: () => now,
    logError: (e) => { errors.push(e); },
  });
  const call = (method: string, path: string, { token = 'ok', body, query = {} }: CallOptions = {}) => {
    const request: ApiRequest = {
      method, path, query,
      headers: token ? { authorization: `Bearer ${token}` } : {},
      body: body === undefined ? null : typeof body === 'string' ? body : JSON.stringify(body),
    };
    return api(request);
  };
  return { repo, call, errors };
};

describe('API da landing', () => {
  it('eventos são públicos, sem o link de compra', async () => {
    const { call } = setup();
    const res = await call('GET', '/events', { token: null });
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain('ggtcg.com.br');
    expect((res.body as { events: { id: string; closed: boolean }[] }).events.map((e) => [e.id, e.closed])).toEqual([
      ['ots-genesys-2026-11-21', false],
      ['ots-avancado-2026-11-22', false],
    ]);
  });

  it('sem token ou com token recusado: 401', async () => {
    const { call } = setup();
    expect((await call('GET', '/me', { token: null })).status).toBe(401);
    expect((await call('GET', '/me', { token: 'falso' })).status).toBe(401);
  });

  it('login por senha: 403 GOOGLE_ONLY', async () => {
    const { call } = setup();
    expect(await call('GET', '/me', { token: 'senha' })).toMatchObject({ status: 403, body: { error: 'GOOGLE_ONLY' } });
  });

  it('GET /me cria o lead com a origem da URL e não expõe identificadores do Google', async () => {
    const { call, repo } = setup();
    const res = await call('GET', '/me', { query: { utm_source: 'Instagram' } });
    expect(res.status).toBe(200);
    expect([...repo.leads.values()][0]?.firstTouch.source).toBe('instagram');
    expect(JSON.stringify(res.body)).not.toContain('g-1');
    expect(JSON.stringify(res.body)).not.toContain('c-1');
  });

  it.each([
    [{ phone: '' }, 'phone'],
    [{ birthDate: '' }, 'birthDate'],
    [{ acceptTerms: false }, 'acceptTerms'],
  ])('PUT /me inválido %j: 400 no campo', async (change, field) => {
    const { call } = setup();
    await call('GET', '/me');
    expect(await call('PUT', '/me', { body: { ...profile, ...change } })).toMatchObject({ status: 400, body: { error: 'INVALID', field } });
  });

  it('corpo que não é JSON ou grande demais: 400', async () => {
    const { call } = setup();
    expect((await call('PUT', '/me', { body: '{x' })).status).toBe(400);
    expect((await call('PUT', '/me', { body: { ...profile, fullName: 'a'.repeat(5000) } })).status).toBe(400);
  });

  it('checkout bloqueado para cadastro incompleto (409)', async () => {
    const { call } = setup();
    await call('GET', '/me');
    expect(await call('POST', '/checkout', { body: { eventId: 'ots-genesys-2026-11-21' } })).toMatchObject({ status: 409, body: { error: 'PROFILE_INCOMPLETE' } });
  });

  it('checkout elegível devolve sempre o link configurado, ignorando URL enviada', async () => {
    const { call, repo } = setup();
    await call('GET', '/me');
    await call('PUT', '/me', { body: profile });
    const res = await call('POST', '/checkout', { body: { eventId: 'ots-genesys-2026-11-21', url: 'https://malicioso.example', utm: { utm_source: 'instagram' } } });
    expect(res).toMatchObject({ status: 200, body: { url: goodgame.checkoutUrl } });
    expect(repo.intents[0]?.utm.source).toBe('instagram');
  });

  it('evento desconhecido 404; depois do fechamento 409 EVENT_CLOSED; sem gravar intenção', async () => {
    const late = setup(new Date('2026-11-21T14:00:00Z'));
    await late.call('GET', '/me');
    await late.call('PUT', '/me', { body: profile });
    expect(await late.call('POST', '/checkout', { body: { eventId: 'evento-x' } })).toMatchObject({ status: 404, body: { error: 'EVENT_NOT_FOUND' } });
    expect(await late.call('POST', '/checkout', { body: { eventId: 'ots-genesys-2026-11-21' } })).toMatchObject({ status: 409, body: { error: 'EVENT_CLOSED' } });
    expect(late.repo.intents).toHaveLength(0);
  });

  it('erro inesperado: 500 sem detalhes, registrado no log', async () => {
    const { call, repo, errors } = setup();
    repo.findByGoogleSub = () => Promise.reject(new Error('dynamo fora'));
    const res = await call('GET', '/me');
    expect(res).toEqual({ status: 500, body: { error: 'INTERNAL' } });
    expect(errors).toHaveLength(1);
  });

  it('rota desconhecida: 404', async () => {
    const { call } = setup();
    expect((await call('GET', '/nada')).status).toBe(404);
  });
});
