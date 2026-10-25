import type { MeResponse } from '@tom/contracts';
import { describe, expect, it } from 'vitest';
import { createApi, OfflineError } from '../src/api.js';
import type { Session } from '../src/auth/session.js';
import { isMinor, screenFor, toRegisterRequest } from '../src/flow.js';

const failure = (error: string) => ({ ok: false as const, status: 400, error: { error, message: `msg ${error}` } });

describe('telas', () => {
  it('cada resposta do GET /me leva à tela certa', () => {
    const me = { id: 'x' } as MeResponse;
    expect(screenFor({ ok: true, status: 200, body: me })).toEqual({ name: 'home', me });
    expect(screenFor(failure('account_not_found'))).toEqual({ name: 'register' });
    expect(screenFor(failure('session_inactive'))).toEqual({ name: 'device' });
    expect(screenFor(failure('unauthorized'))).toEqual({ name: 'login' });
    expect(screenFor(failure('internal'))).toEqual({ name: 'error', message: 'msg internal' });
  });

  it('senha num e-mail que já tem conta: volta ao login com a orientação (o app sai da sessão)', () => {
    expect(screenFor(failure('account_exists'))).toEqual({ name: 'login', message: 'msg account_exists', signOut: true });
  });

  it('autorização do responsável só para menores', () => {
    const today = new Date('2026-10-24');
    expect(isMinor(2010, today)).toBe(true);
    expect(isMinor(2008, today)).toBe(false);
  });

  it('formulário vira o contrato do cadastro', () => {
    expect(toRegisterRequest({ name: ' Ana ', birthYear: '2012', phone: ' ', playerId: '', guardianConsent: true })).toEqual({
      profile: { name: 'Ana', birthYear: 2012, phone: null, guardianConsent: true },
      playerId: null,
    });
  });
});

describe('cliente da API', () => {
  const session = (token: string | null) => ({ accessToken: () => Promise.resolve(token) }) as unknown as Session;

  it('sem conexão nunca vira sucesso', async () => {
    const api = createApi(session('t'), '/api', () => Promise.reject(new TypeError('Failed to fetch')));
    await expect(api.me()).rejects.toThrow(OfflineError);
  });

  it('sem login nem chama a API', async () => {
    let called = false;
    const api = createApi(session(null), '/api', () => { called = true; return Promise.resolve(new Response('{}')); });
    expect(await api.me()).toMatchObject({ ok: false, status: 401, error: { error: 'unauthorized' } });
    expect(called).toBe(false);
  });

  it('manda o token e devolve o erro da API', async () => {
    const api = createApi(session('tok'), '/api', (url, init) => {
      expect(url).toBe('/api/me');
      expect((init?.headers as Record<string, string>).authorization).toBe('Bearer tok');
      return Promise.resolve(new Response(JSON.stringify({ error: 'account_not_found', message: 'x' }), { status: 404 }));
    });
    expect(await api.me()).toMatchObject({ ok: false, status: 404, error: { error: 'account_not_found' } });
  });

  it('painel: rodada atual sem número; rodada anterior no caminho', async () => {
    const urls: string[] = [];
    const api = createApi(session('tok'), '/api', (url) => { urls.push(url as string); return Promise.resolve(new Response('{}')); });
    await api.panel();
    await api.panel(2);
    await api.keyLaunched(1);
    await api.keyLaunched(1, 2);
    await api.override(3, { kind: 'intentional_draw' }, 'x', 2);
    expect(urls).toEqual([
      '/api/panel', '/api/panel/rounds/2', '/api/panel/tables/1/key-launched', '/api/panel/rounds/2/tables/1/key-launched',
      '/api/panel/rounds/2/tables/3/override',
    ]);
  });
});
