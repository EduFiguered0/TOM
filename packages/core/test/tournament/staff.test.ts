import { describe, expect, it } from 'vitest';
import { staffActor, type Account, type Principal, type TournamentEvent } from '../../src/index.js';

const account = (judge: boolean): Account => ({
  id: 'juiz', email: 'j@example.com', logins: ['l'], playerId: null, activeSession: 's', createdAt: new Date(), judge,
  profile: { name: 'Juiz', birthYear: 1990, phone: null, guardianConsent: false },
});
const event = (judges: string[]): TournamentEvent => ({
  id: 'ev', label: 'Liga', tournament: 'FODASE', tokenHash: 'h', revoked: false, createdAt: new Date(), createdBy: 'adm', judges,
});
const player = (judge: boolean): Principal => ({ account: account(judge), actor: null });

describe('quem age no painel', () => {
  it('ADM sempre age', () => {
    const admin: Principal = { account: account(false), actor: { role: 'admin', accountId: 'juiz' } };
    expect(staffActor(admin, null)).toEqual({ role: 'admin', accountId: 'juiz' });
  });

  it('juiz da equipe escalado age como juiz', () => {
    expect(staffActor(player(true), event(['juiz']))).toEqual({ role: 'judge', accountId: 'juiz' });
  });

  it('juiz da equipe não escalado não age', () => {
    expect(staffActor(player(true), event(['outro']))).toBeNull();
  });

  it('escalado mas tirado da equipe não age', () => {
    expect(staffActor(player(false), event(['juiz']))).toBeNull();
  });

  it('sem evento atual, só o ADM', () => {
    expect(staffActor(player(true), null)).toBeNull();
  });
});
