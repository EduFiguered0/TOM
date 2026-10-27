import type { BoardResponse, MeResponse, PlayerRowDto } from '@tom/contracts';
import { describe, expect, it } from 'vitest';
import { profile, register, setup, setupRound } from './support.js';

const ADM = 'adm:a1:admin';
const PNG = `data:image/png;base64,${'A'.repeat(100)}`;

describe('foto do jogador pela API', () => {
  it('jogador põe a foto; lê pela chave; troca e tira; formato errado dá 400', async () => {
    const { call } = setup();
    await register(call, 'ana-email:c1', '100001');
    const me = (await call('POST', '/me/photo', 'ana-email:c1', { photo: PNG })).body as MeResponse;
    expect(me.photo).toBeTruthy();
    expect(await call('GET', `/photos/${me.photo ?? ''}`, 'ana-email:c1')).toMatchObject({ status: 200, body: { photo: PNG } });
    expect((await call('GET', `/photos/${me.photo ?? ''}`, null)).status).toBe(401);
    expect((await call('POST', '/me/photo', 'ana-email:c1', { photo: 'data:text/html;base64,AAAA' })).status).toBe(400);
    expect(((await call('POST', '/me/photo', 'ana-email:c1', { photo: null })).body as MeResponse).photo).toBeNull();
  });

  it('menor: foto só aparece para os outros com a autorização de imagem', async () => {
    const { call } = setup();
    await register(call, 'adm:a1');
    const kid = (await call('POST', '/me', 'kid:k1', { profile: { ...profile, birthYear: 2015, guardianConsent: true }, playerId: '100009' })).body as MeResponse;
    await call('POST', '/me/photo', 'kid:k1', { photo: PNG });
    const row = async () => ((await call('POST', '/players/search', ADM, { query: '100009' })).body as PlayerRowDto[])[0];
    expect((await row())?.photo).toBeNull();
    expect(((await call('POST', '/me/image-consent', 'kid:k1', { consent: true })).body as MeResponse).imageConsent).toBe(true);
    expect((await row())?.photo).toBeTruthy();
    expect(kid.id).toBeTruthy();
  });

  it('o ADM tira a foto de um jogador; jogador não tira a de outro', async () => {
    const { call } = setup();
    await register(call, 'adm:a1');
    const ana = await register(call, 'ana-email:c1', '100001');
    await register(call, 'bia:c2', '100002');
    await call('POST', '/me/photo', 'ana-email:c1', { photo: PNG });
    expect((await call('POST', `/players/${ana}/photo/remove`, 'bia:c2')).status).toBe(403);
    expect(await call('POST', `/players/${ana}/photo/remove`, ADM)).toMatchObject({ status: 200, body: { photo: null } });
  });

  it('foto na mesa: na TV (ADM) e no celular do oponente', async () => {
    const ctx = await setupRound();
    await ctx.call('POST', '/me/photo', 'p2:c2', { photo: PNG });
    await ctx.start();
    const board = (await ctx.call('GET', '/board', ADM)).body as Extract<BoardResponse, { state: 'running' }>;
    expect(board.tables[0]).toMatchObject({ table: 1, photo1: null, photo2: expect.any(String) as unknown });
    const mine = await ctx.me('p1:c1');
    expect(mine.round?.seat).toMatchObject({ kind: 'table', opponentPhoto: board.tables[0]?.photo2 });
  });
});
