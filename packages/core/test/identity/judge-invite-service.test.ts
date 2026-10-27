import { describe, expect, it } from 'vitest';
import {
  AccountService,
  CommandRejected,
  InMemoryAccountRepository,
  InMemoryJudgeInviteRepository,
  JudgeInviteService,
  type Identity,
  type Principal,
  type Profile,
  type RejectCode,
} from '../../src/index.js';
import { TestClock } from '../tournament/support.js';
import { judgeInviteRepositoryContract } from './judge-invite-repository-contract.js';

judgeInviteRepositoryContract('em memória', () => new InMemoryJudgeInviteRepository());

const admin = { role: 'admin', accountId: 'adm' } as const;
const adult: Profile = { firstName: 'Ana', lastName: 'Souza', birthYear: 1990, phone: null, guardianConsent: false };

const setup = () => {
  const accounts = new InMemoryAccountRepository();
  const clock = new TestClock(new Date('2026-10-27T14:00:00Z'));
  let n = 0;
  const ids = { next: () => `i${String(++n)}` };
  const accountService = new AccountService({ accounts, clock, ids });
  const service = new JudgeInviteService({ invites: new InMemoryJudgeInviteRepository(), accounts: accountService, clock });
  const person = async (login: string, playerId: string | null): Promise<{ identity: Identity; principal: Principal }> => {
    const identity: Identity = { login, session: `s-${login}`, groups: [], provider: 'password' };
    await accountService.register(identity, `${login}@example.com`, { profile: adult, playerId });
    return { identity, principal: await accountService.authenticate(identity) };
  };
  return { service, accounts, clock, person };
};

const rejects = async (promise: Promise<unknown>, code: RejectCode, message?: string) => {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(CommandRejected);
  expect((error as CommandRejected).code).toBe(code);
  if (message) expect((error as CommandRejected).message).toBe(message);
};

describe('convite de juiz', () => {
  it('ADM gera; código de 10 caracteres; vale 15 minutos; aceitar põe na equipe e gasta o convite', async () => {
    const { service, accounts, person } = setup();
    const invite = await service.create(admin);
    expect(invite.code).toMatch(/^[A-HJ-NP-Z2-9]{10}$/);
    expect(invite.expiresAt).toEqual(new Date('2026-10-27T14:15:00Z'));
    const ana = await person('ana', '100001');
    expect((await service.accept(ana.principal, invite.code)).judge).toBe(true);
    expect(accounts.events.at(-1)).toMatchObject({ type: 'judge_set', judge: true, actor: { role: 'system', source: `invite:${invite.code}` } });
    const bia = await person('bia', '100002');
    await rejects(service.accept(bia.principal, invite.code), 'invite_invalid', 'Convite já utilizado ou vencido');
  });

  it('vencido aos 15 minutos', async () => {
    const { service, clock, person } = setup();
    const invite = await service.create(admin);
    clock.advance(15);
    await rejects(service.accept((await person('ana', '100001')).principal, invite.code), 'invite_invalid');
  });

  it('conta sem Player ID é recusada e o convite continua valendo', async () => {
    const { service, person } = setup();
    const invite = await service.create(admin);
    await rejects(service.accept((await person('sem', null)).principal, invite.code), 'invalid_input', 'O juiz precisa ter Player ID cadastrado');
    expect((await service.accept((await person('ana', '100001')).principal, invite.code)).judge).toBe(true);
  });

  it('lista os abertos com o vencimento; cancelado sai da lista e não é aceito; só o ADM', async () => {
    const { service, clock, person } = setup();
    const [a, b] = [await service.create(admin), await service.create(admin)];
    clock.advance(1);
    const c = await service.create(admin);
    await service.cancel(admin, b.code);
    expect((await service.open(admin)).map((i) => i.code).sort()).toEqual([a.code, c.code].sort());
    await rejects(service.accept((await person('ana', '100001')).principal, b.code), 'invite_invalid');
    const player = { role: 'player', accountId: 'x', playerId: '100001' } as never;
    await rejects(service.create(player), 'forbidden');
    await rejects(service.open(player), 'forbidden');
    await rejects(service.cancel(player, a.code), 'forbidden');
    clock.advance(14);
    expect((await service.open(admin)).map((i) => i.code)).toEqual([c.code]);
  });
});
