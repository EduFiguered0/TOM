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

  it('TV só para o ADM, sem cache público; sem evento, espera', async () => {
    const { call } = setup();
    await register(call, 'adm:a1');
    await register(call, 'ana-email:s1', '100001');
    expect((await call('GET', '/board', null)).status).toBe(401);
    expect((await call('GET', '/board', 'ana-email:s1')).status).toBe(403);
    const board = await call('GET', '/board', 'adm:a1:admin');
    expect(board).toMatchObject({ status: 200, body: { state: 'idle' } });
    expect(board.cacheControl).toBeUndefined();
  });

  it('pareamento sozinho espera as guias; com as guias a rodada é publicada e a TV mostra ao iniciar', async () => {
    const { send, call } = await withEvent();
    expect(await send(upload('pairings'))).toMatchObject({ status: 200, body: { stored: true, published: [], note: expect.stringMatching(/Aguardando/) as unknown } });

    const done = await send(upload('match_slips'));
    expect(done.status).toBe(200);
    expect(done.body.published).toHaveLength(1);

    // Inscrições abertas: a TV mostra o QR até a rodada 1 começar.
    expect((await call('GET', '/board', 'adm:a1:admin')).body).toMatchObject({ state: 'open' });
    await call('POST', '/round/start', 'adm:a1:admin', { bestOf: 3, roundMinutes: null });
    const board = await call('GET', '/board', 'adm:a1:admin');
    expect(board).toMatchObject({ status: 200 });
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

  it('token errado, revogado ou de outro torneio (rodada 1 começada) é recusado', async () => {
    const { send, call, eventId } = await withEvent();
    expect((await send(upload('pairings'), 'inventado')).status).toBe(401);
    await send(upload('pairings'));
    await send(upload('match_slips'));
    expect((await call('POST', '/round/start', 'adm:a1:admin', { bestOf: 3, roundMinutes: null })).status).toBe(200);
    const other = { ...upload('pairings'), tournament: 'OUTRO', fileName: 'OUTROpairings.html' };
    expect((await send(other)).body).toMatchObject({ error: 'tournament_mismatch' });
    expect((await call('POST', `/events/${eventId}/revoke`, 'adm:a1:admin')).status).toBe(200);
    expect((await send(upload('match_slips'))).status).toBe(401);
  });

  it('com a rodada 1 começada, só o ADM escolhe outro torneio, e os envios dele passam', async () => {
    const { send, call, eventId } = await withEvent();
    await send(upload('pairings'));
    await send(upload('match_slips'));
    await call('POST', '/round/start', 'adm:a1:admin', { bestOf: 3, roundMinutes: null });
    const other = { ...upload('pairings'), tournament: 'OUTRO', fileName: 'OUTROpairings.html' };
    await register(call, 'ana-email:s1', '100001');
    expect((await call('POST', `/events/${eventId}/tournament`, 'ana-email:s1', { tournament: 'OUTRO' })).status).toBe(403);
    expect(await call('POST', `/events/${eventId}/tournament`, 'adm:a1:admin', { tournament: 'OUTRO' }))
      .toMatchObject({ status: 200, body: { label: 'OUTRO' } });
    expect((await send(other)).body).toMatchObject({ stored: true });
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

describe('envio pelo navegador do ADM', () => {
  const ADM = 'adm:a1:admin';

  it('ADM envia pelo navegador: pareamento + guias publicam a rodada do evento ativo', async () => {
    const { call } = await withEvent();
    expect((await call('POST', '/events/active/uploads', ADM, upload('pairings'))).status).toBe(200);
    const done = await call('POST', '/events/active/uploads', ADM, upload('match_slips'));
    expect(done).toMatchObject({ status: 200, body: { stored: true, published: [{ round: 3 }] } });
    expect((await call('POST', '/round/start', ADM, { bestOf: 3, roundMinutes: null })).status).toBe(200);
  });

  it('jogador recebe 403', async () => {
    const { call } = await withEvent();
    await register(call, 'p1:c1', '100001');
    expect((await call('POST', '/events/active/uploads', 'p1:c1', upload('pairings'))).status).toBe(403);
    expect((await call('POST', '/events/active/uploads', null, upload('pairings'))).status).toBe(401);
  });

  it('evento cancelado: recusa e nada é guardado', async () => {
    const { call, eventId } = await withEvent();
    await call('POST', `/events/${eventId}/cancel`, ADM);
    expect(await call('POST', '/events/active/uploads', ADM, upload('pairings'))).toMatchObject({
      status: 409, body: { message: 'Crie o evento para começar a enviar' },
    });
    await call('POST', '/events', ADM, { label: 'Outro' });
    expect((await call('POST', '/events/active/uploads', ADM, upload('pairings'))).body).toMatchObject({ stored: true });
  });

  it('arquivo do torneio anterior (de antes do evento) é ignorado e não prende o evento a ele', async () => {
    const { call } = await withEvent();
    const old = upload('pairings', undefined, '2026-10-22T20:00:00Z');
    expect(await call('POST', '/events/active/uploads', ADM, old)).toMatchObject({
      status: 200, body: { stored: false, published: [], note: 'Arquivo de antes do evento: ignorado' },
    });
    expect((await call('POST', '/events/active/uploads', ADM, upload('pairings'))).body).toMatchObject({ stored: true });
  });

  it('token antigo continua funcionando', async () => {
    const { send } = await withEvent();
    expect((await send(upload('pairings'))).status).toBe(200);
  });
});
