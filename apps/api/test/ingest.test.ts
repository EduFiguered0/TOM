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

  it('TV sem rodada: 404 público, guardável pelo CloudFront', async () => {
    const { call } = setup();
    expect(await call('GET', '/board', null)).toMatchObject({ status: 404, body: { error: 'no_round' }, cacheControl: 'public, max-age=5' });
  });

  it('pareamento sozinho espera as guias; com as guias a rodada é publicada e a TV mostra', async () => {
    const { send, call } = await withEvent();
    expect(await send(upload('pairings'))).toMatchObject({ status: 200, body: { stored: true, published: [], note: expect.stringMatching(/Aguardando/) as unknown } });

    const done = await send(upload('match_slips'));
    expect(done.status).toBe(200);
    expect(done.body.published).toHaveLength(1);

    const board = await call('GET', '/board', null);
    expect(board).toMatchObject({ status: 200, cacheControl: 'public, max-age=5' });
    const body = board.body as BoardResponse;
    expect(body).toMatchObject({ tournament: 'FODASE', startedAt: null, endsAt: null });
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
