import type { MeResponse } from '@tom/contracts';
import { describe, expect, it } from 'vitest';
import { register, setup } from './support.js';

const ADM = 'adm:a1:admin';

describe('convite de juiz pela API', () => {
  it('ADM gera, lista e cancela; quem aceita vira juiz; o convite não vale de novo', async () => {
    const { call } = setup();
    await register(call, 'adm:a1');
    await register(call, 'ana-email:c1', '100001');
    await register(call, 'bia:c2', '100002');
    const created = await call('POST', '/staff/invites', ADM);
    expect(created).toMatchObject({ status: 201, body: { code: expect.stringMatching(/^[A-Z2-9]{10}$/) as unknown, expiresAt: '2026-10-23T14:15:00.000Z' } });
    const { code } = created.body as { code: string };
    const other = ((await call('POST', '/staff/invites', ADM)).body as { code: string }).code;
    expect((await call('GET', '/staff/invites', ADM)).body).toHaveLength(2);
    expect((await call('POST', `/staff/invites/${other}/cancel`, ADM)).status).toBe(204);
    expect((await call('GET', '/staff/invites', ADM)).body).toEqual([{ code, expiresAt: '2026-10-23T14:15:00.000Z' }]);

    const accepted = await call('POST', `/invites/${code}/accept`, 'ana-email:c1');
    expect(accepted).toMatchObject({ status: 200, body: { judge: true } });
    expect((accepted.body as MeResponse).playerId).toBe('100001');
    expect(await call('POST', `/invites/${code}/accept`, 'bia:c2')).toMatchObject({ status: 410, body: { error: 'invite_invalid', message: 'Convite já utilizado ou vencido' } });
    expect((await call('POST', `/invites/${other}/accept`, 'bia:c2')).status).toBe(410);
  });

  it('só o ADM gera, lista e cancela; aceitar exige login', async () => {
    const { call } = setup();
    await register(call, 'ana-email:c1', '100001');
    expect((await call('POST', '/staff/invites', 'ana-email:c1')).status).toBe(403);
    expect((await call('GET', '/staff/invites', 'ana-email:c1')).status).toBe(403);
    expect((await call('POST', '/staff/invites/ABCDEFGHJK/cancel', 'ana-email:c1')).status).toBe(403);
    expect((await call('POST', '/invites/ABCDEFGHJK/accept', null)).status).toBe(401);
  });
});
