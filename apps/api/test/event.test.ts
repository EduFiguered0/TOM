import type { ActiveEventResponse, CreateEventResponse, MyEventResponse, RegistrationsResponse } from '@tom/contracts';
import { describe, expect, it } from 'vitest';
import { register, setup, setupRound, upload } from './support.js';

const ADM = 'adm:a1:admin';

/** ADM com um evento aberto e dois jogadores cadastrados (ainda não inscritos). */
const opened = async () => {
  const ctx = setup();
  await register(ctx.call, 'adm:a1');
  const created = await ctx.call('POST', '/events', ADM, { label: 'Liga de Outubro', date: '2026-11-07', roundMinutes: 40 });
  const { event } = created.body as CreateEventResponse;
  const ana = await register(ctx.call, 'ana-email:c1', '100001');
  const bia = await register(ctx.call, 'bia:c2', '100002');
  const list = async () => (await ctx.call('GET', `/events/${event.id}/registrations`, ADM)).body as RegistrationsResponse;
  return { ...ctx, created, event, code: event.code ?? '', ana, bia, list };
};

describe('ciclo do evento pela API', () => {
  it('ADM cria, vê o ativo com o código e não cria outro (409)', async () => {
    const { call, created, event } = await opened();
    expect(created).toMatchObject({ status: 201, body: { token: expect.any(String) as unknown, event: { status: 'open', date: '2026-11-07', roundMinutes: 40 } } });
    expect(event.code).toMatch(/^[A-Z2-9]{8}$/);
    expect((await call('GET', '/events/active', ADM)).body as ActiveEventResponse).toMatchObject({ event: { id: event.id, code: event.code } });
    expect(await call('POST', '/events', ADM, { label: 'Outro' })).toMatchObject({
      status: 409, body: { message: 'Já existe um evento ativo. Encerre ou cancele antes de criar outro.' },
    });
  });

  it('jogador escaneia e fica inscrito; o ADM vê na lista com Player ID, nome e ano', async () => {
    const { call, code, list, ana } = await opened();
    const joined = await call('POST', `/join/${code}`, 'ana-email:c1');
    expect(joined).toMatchObject({ status: 200, body: { event: { label: 'Liga de Outubro' }, registration: { accountId: ana, confirmed: false } } });
    expect(JSON.stringify(joined.body)).not.toContain(code);
    expect((await call('POST', `/join/${code}`, 'ana-email:c1')).status).toBe(200);
    expect(await list()).toMatchObject({ total: 1, confirmed: 0, launched: 0, registrations: [{ playerId: '100001', name: 'Ana Souza', birthYear: 1990, inRound: null }] });
    expect((await call('GET', '/me/event', 'ana-email:c1')).body as MyEventResponse).toMatchObject({ event: { status: 'open' }, registration: { accountId: ana } });
    expect((await call('POST', '/join/ZZZZZZZZ', 'ana-email:c1')).status).toBe(404);
  });

  it('pedir confirmação fecha o QR; o jogador confirma pelo celular; contadores', async () => {
    const { call, code, list, event } = await opened();
    await call('POST', `/join/${code}`, 'ana-email:c1');
    expect(await call('POST', `/events/${event.id}/confirmation`, ADM)).toMatchObject({ status: 200, body: { status: 'confirming' } });
    expect(await call('POST', `/join/${code}`, 'bia:c2')).toMatchObject({ status: 409, body: { message: 'Inscrições encerradas' } });
    expect((await call('POST', '/me/event/confirm', 'ana-email:c1')).status).toBe(200);
    expect(await list()).toMatchObject({ total: 1, confirmed: 1 });
  });

  it('ADM remove, confirma por ele, marca lançado e inscreve à mão', async () => {
    const { call, code, list, event, ana, bia } = await opened();
    await call('POST', `/join/${code}`, 'ana-email:c1');
    expect((await call('POST', `/events/${event.id}/registrations`, ADM, { accountId: bia })).status).toBe(200);
    expect((await call('POST', `/events/${event.id}/registrations/${ana}/launched`, ADM, { launched: true })).status).toBe(200);
    expect((await call('POST', `/events/${event.id}/registrations/${bia}/confirm`, ADM)).status).toBe(200);
    expect((await call('POST', `/events/${event.id}/registrations/${ana}/remove`, ADM)).status).toBe(200);
    expect(await list()).toMatchObject({ total: 1, confirmed: 1, launched: 0 });
    expect(await call('POST', `/join/${code}`, 'ana-email:c1')).toMatchObject({ status: 403, body: { message: 'Sua inscrição foi removida, procure o ADM' } });
  });

  it('inRound aponta quem confirmou e não está nas guias', async () => {
    const ctx = await setupRound();
    const p9 = await register(ctx.call, 'p9:c9', '100099');
    for (const token of ['p1:c1', 'p9:c9']) {
      const { code } = ((await ctx.call('GET', '/events/active', ADM)).body as ActiveEventResponse).event ?? { code: '' };
      await ctx.call('POST', `/join/${code ?? ''}`, token);
    }
    const body = (await ctx.call('GET', `/events/${ctx.eventId}/registrations`, ADM)).body as RegistrationsResponse;
    expect(body.registrations.find((r) => r.accountId === p9)?.inRound).toBe(false);
    expect(body.registrations.find((r) => r.playerId === '100001')?.inRound).toBe(true);
  });

  it('desfazer vínculo derruba a inscrição no evento ativo', async () => {
    const { call, code, list } = await opened();
    await call('POST', `/join/${code}`, 'ana-email:c1');
    await call('POST', '/player-ids/100001/unlink', ADM);
    expect(await list()).toMatchObject({ total: 0, registrations: [{ removed: true }] });
  });

  it('jogador não usa as rotas do ADM (403); visitante sem login recebe 401', async () => {
    const { call, event, ana } = await opened();
    expect((await call('GET', '/events/active', 'ana-email:c1')).status).toBe(403);
    expect((await call('GET', `/events/${event.id}/registrations`, 'ana-email:c1')).status).toBe(403);
    expect((await call('POST', `/events/${event.id}/confirmation`, 'ana-email:c1')).status).toBe(403);
    expect((await call('POST', `/events/${event.id}/registrations/${ana}/confirm`, 'ana-email:c1')).status).toBe(403);
    expect((await call('POST', `/join/${event.code ?? ''}`, null)).status).toBe(401);
    expect((await call('GET', '/me/event', null)).status).toBe(401);
  });

  it('ADM muda o tempo de rodada; encerrar só depois do final; cancelar libera o próximo', async () => {
    const { call, event } = await opened();
    expect(await call('PATCH', `/events/${event.id}`, ADM, { roundMinutes: 50 })).toMatchObject({ status: 200, body: { roundMinutes: 50 } });
    expect(await call('POST', `/events/${event.id}/close`, ADM)).toMatchObject({ status: 409, body: { message: 'O evento só encerra depois do resultado final do TOM' } });
    expect(await call('POST', `/events/${event.id}/cancel`, ADM)).toMatchObject({ status: 200, body: { status: 'cancelled' } });
    expect((await call('GET', '/events/active', ADM)).body).toEqual({ event: null });
    expect((await call('POST', '/events', ADM, { label: 'Próximo' })).status).toBe(201);
  });
});

describe('resultado final e rodada 1', () => {
  it('standings da última rodada marcam o resultado final; aí encerra', async () => {
    const ctx = await setupRound();
    await ctx.start();
    expect((await ctx.send(upload('standings'))).status).toBe(200);
    const active = ((await ctx.call('GET', '/events/active', ADM)).body as ActiveEventResponse).event;
    expect(active?.status).toBe('final');
    expect(await ctx.call('POST', `/events/${ctx.eventId}/close`, ADM)).toMatchObject({ status: 200, body: { status: 'closed' } });
  });

  it('standings de rodada intermediária não marcam', async () => {
    const ctx = await setupRound();
    await ctx.start();
    const content = upload('standings').content.replace('Rodada 3/3', 'Rodada 2/3');
    await ctx.send(upload('standings', content, '2026-10-24T15:00:00Z'));
    expect(((await ctx.call('GET', '/events/active', ADM)).body as ActiveEventResponse).event?.status).toBe('running');
  });

  it('não inicia a rodada 1 antes de pedir a confirmação', async () => {
    const ctx = await setupRound();
    expect(await ctx.call('POST', '/round/start', ADM, { bestOf: 3, roundMinutes: null })).toMatchObject({
      status: 409, body: { message: 'Peça a confirmação de presença antes de iniciar a rodada 1' },
    });
  });

  it('não inicia com pendente; confirmados todos, inicia e o evento fica em andamento', async () => {
    const ctx = await setupRound();
    const active = ((await ctx.call('GET', '/events/active', ADM)).body as ActiveEventResponse).event;
    await ctx.call('POST', `/join/${active?.code ?? ''}`, 'p1:c1');
    await ctx.call('POST', `/events/${ctx.eventId}/confirmation`, ADM);
    expect(await ctx.call('POST', '/round/start', ADM, { bestOf: 3, roundMinutes: null })).toMatchObject({
      status: 409, body: { message: 'Ainda há 1 inscrito(s) sem confirmar presença' },
    });
    await ctx.call('POST', '/me/event/confirm', 'p1:c1');
    expect((await ctx.call('POST', '/round/start', ADM, { bestOf: 3, roundMinutes: null })).status).toBe(200);
    expect(((await ctx.call('GET', '/events/active', ADM)).body as ActiveEventResponse).event?.status).toBe('running');
  });

  it('rodada usa o tempo do evento quando não vem tempo', async () => {
    const ctx = await setupRound();
    await ctx.call('PATCH', `/events/${ctx.eventId}`, ADM, { roundMinutes: 45 });
    await ctx.start();
    const board = (await ctx.call('GET', '/board', null)).body as { startedAt: string; endsAt: string };
    expect(new Date(board.endsAt).getTime() - new Date(board.startedAt).getTime()).toBe(45 * 60_000);
  });
});

describe('rodada de evento encerrado ou cancelado', () => {
  it('some do celular, não aceita reporte e sai do painel', async () => {
    const ctx = await setupRound();
    await ctx.start();
    expect((await ctx.me('p1:c1')).round).not.toBeNull();
    await ctx.call('POST', `/events/${ctx.eventId}/cancel`, ADM);
    expect((await ctx.me('p1:c1')).round).toBeNull();
    expect(await ctx.report('p1:c1', { kind: 'score', own: 2, opponent: 1 })).toMatchObject({ status: 409, body: { error: 'round_not_paired' } });
    expect((await ctx.call('GET', '/panel', ADM)).body).toMatchObject({ round: null });
    expect((await ctx.call('POST', '/panel/tables/1/extend', ADM, { minutes: 5 })).status).toBe(409);
  });
});
