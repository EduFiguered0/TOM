import type { BoardResponse } from '@tom/contracts';
import { describe, expect, it } from 'vitest';
import { register, setup, upload, withEvent } from './support.js';

describe('ingestão: TOM → enviador → API', () => {
  it('só o ADM cria evento; o token só aparece na criação', async () => {
    const { call } = setup();
    await register(call, 'ana-email:s1');
    expect((await call('POST', '/events', 'ana-email:s1', { label: 'Liga' })).status).toBe(403);
    await register(call, 'adm:a1');
    const created = await call('POST', '/events', 'adm:a1:admin', { label: 'Liga' });
    expect(created).toMatchObject({ status: 201, body: { label: 'Liga', token: expect.stringMatching(/^[\w-]{43}$/) as unknown } });
  });

  it('TV sem evento: espera, pública e guardável pelo CloudFront', async () => {
    const { call } = setup();
    expect(await call('GET', '/board', null)).toMatchObject({ status: 200, body: { state: 'idle' }, cacheControl: 'public, max-age=5' });
  });

  it('pareamento sozinho espera as guias; com as guias a rodada é publicada e a TV mostra ao iniciar', async () => {
    const { send, call, eventId } = await withEvent();
    expect(await send(upload('pairings'))).toMatchObject({ status: 200, body: { stored: true, published: [], note: expect.stringMatching(/Aguardando/) as unknown } });

    const done = await send(upload('match_slips'));
    expect(done.status).toBe(200);
    expect(done.body.published).toHaveLength(1);

    // Inscrições abertas: a TV mostra o QR até a rodada 1 começar.
    expect((await call('GET', '/board', null)).body).toMatchObject({ state: 'open' });
    await call('POST', `/events/${eventId}/confirmation`, 'adm:a1:admin');
    await call('POST', '/round/start', 'adm:a1:admin', { bestOf: 3, roundMinutes: null });
    const board = await call('GET', '/board', null);
    expect(board).toMatchObject({ status: 200, cacheControl: 'public, max-age=5' });
    const body = board.body as Extract<BoardResponse, { state: 'running' }>;
    expect(body).toMatchObject({ state: 'running', tournament: 'FODASE', endsAt: expect.any(String) as unknown });
    expect(body.tables.length).toBeGreaterThan(0);
    expect(body.tables.every((t) => t.color === 'gray' && t.player1 && t.player2)).toBe(true);
    expect(JSON.stringify(body)).not.toMatch(/playerId|keys/);
  });

  it('reenvio igual não republica; outros relatórios só são guardados', async () => {
    const { send } = await withEvent();
    await send(upload('pairings'));
    await send(upload('match_slips'));
    expect((await send(upload('match_slips'))).body).toMatchObject({ stored: false, published: [] });
    expect((await send(upload('standings'))).body).toEqual({ stored: true, published: [], note: null });
  });

  it('token errado, revogado ou de outro torneio é recusado', async () => {
    const { send, call, eventId } = await withEvent();
    expect((await send(upload('pairings'), 'inventado')).status).toBe(401);
    await send(upload('pairings'));
    const other = { ...upload('pairings'), tournament: 'OUTRO', fileName: 'OUTROpairings.html' };
    expect((await send(other)).body).toMatchObject({ error: 'tournament_mismatch' });
    expect((await call('POST', `/events/${eventId}/revoke`, 'adm:a1:admin')).status).toBe(200);
    expect((await send(upload('match_slips'))).status).toBe(401);
  });

  it('conteúdo adulterado ou nome de arquivo inconsistente é recusado', async () => {
    const { send } = await withEvent();
    expect((await send({ ...upload('pairings'), content: '<html>adulterado</html>' })).status).toBe(400);
    expect((await send({ ...upload('pairings'), fileName: 'FODASEstandings.html' })).status).toBe(400);
  });
});

describe('ingestão: pareamento já publicado', () => {
  it('não republica quando o banco devolve o mesmo pareamento com as chaves em outra ordem', async () => {
    const { send, rounds } = await withEvent();
    await send(upload('pairings'));
    await send(upload('match_slips'));
    // Simula o DynamoDB: mesmo conteúdo, chaves dos objetos em ordem invertida.
    const reverse = (v: unknown): unknown => Array.isArray(v) ? v.map(reverse)
      : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).reverse().map(([k, x]) => [k, reverse(x)])) : v;
    const original = rounds.state.bind(rounds);
    rounds.state = async (ref) => { const s = await original(ref); return { ...s, pairing: reverse(s.pairing) as typeof s.pairing }; };
    expect((await send(upload('match_slips', undefined, '2026-10-24T15:00:00Z'))).body).toMatchObject({ stored: true, published: [] });
  });
});
