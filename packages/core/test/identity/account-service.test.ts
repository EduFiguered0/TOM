import { describe, expect, it } from 'vitest';
import {
  AccountService,
  CommandRejected,
  InMemoryAccountRepository,
  type Identity,
  type Profile,
  type RejectCode,
} from '../../src/index.js';
import { TestClock } from '../tournament/support.js';
import { accountRepositoryContract } from './account-repository-contract.js';

accountRepositoryContract('em memória', () => new InMemoryAccountRepository());

const adult: Profile = { name: '  Ana   Souza ', birthYear: 1990, phone: '(11) 98888-7777', guardianConsent: false };
const admin = { role: 'admin', accountId: 'adm' } as const;

const identity = (overrides: Partial<Identity> = {}): Identity => ({
  accountId: 'conta-1', session: 'celular-1', groups: [], ...overrides,
});

const setup = () => {
  const accounts = new InMemoryAccountRepository();
  let n = 0;
  const service = new AccountService({ accounts, clock: new TestClock(), ids: { next: () => `i${String(++n)}` } });
  return { accounts, service };
};

const rejects = async (promise: Promise<unknown>, code: RejectCode) => {
  await expect(promise).rejects.toThrow(CommandRejected);
  await promise.catch((e: unknown) => { expect((e as CommandRejected).code).toBe(code); });
};

describe('cadastro', () => {
  it('normaliza o perfil, deixa o Player ID pendente e ativa o primeiro dispositivo', async () => {
    const { service, accounts } = setup();
    const account = await service.register(identity(), 'ana@example.com', { profile: adult, playerId: ' 100001 ' });
    expect(account.profile).toEqual({ name: 'Ana Souza', birthYear: 1990, phone: '11988887777', guardianConsent: false });
    expect(account.playerId).toEqual({ value: '100001', confirmed: false });
    expect(account.activeSession).toBe('celular-1');
    expect(accounts.events.map((e) => e.type)).toEqual(['account_registered', 'player_id_claimed', 'session_activated']);
  });

  it('menor de idade precisa da autorização do responsável', async () => {
    const { service } = setup();
    await rejects(service.register(identity(), 'ana@example.com', { profile: { ...adult, birthYear: 2015 }, playerId: null }), 'invalid_input');
    const kid = await service.register(identity(), 'ana@example.com', { profile: { ...adult, birthYear: 2015, guardianConsent: true }, playerId: null });
    expect(kid.playerId).toBeNull();
  });

  it.each([
    ['nome curto', { name: 'A' }],
    ['ano no futuro', { birthYear: 2027 }],
    ['telefone curto', { phone: '1234' }],
  ])('recusa %s', async (_, change) => {
    await rejects(setup().service.register(identity(), 'ana@example.com', { profile: { ...adult, ...change }, playerId: null }), 'invalid_input');
  });

  it('recusa Player ID inválido e cadastro repetido', async () => {
    const { service } = setup();
    await rejects(service.register(identity(), 'ana@example.com', { profile: adult, playerId: 'abc' }), 'invalid_input');
    await service.register(identity(), 'ana@example.com', { profile: adult, playerId: null });
    await rejects(service.register(identity(), 'ana@example.com', { profile: adult, playerId: null }), 'account_exists');
  });
});

describe('sessão única', () => {
  const registered = async () => {
    const ctx = setup();
    await ctx.service.register(identity(), 'ana@example.com', { profile: adult, playerId: null });
    return ctx;
  };

  it('outro dispositivo só entra com confirmação, e o anterior é revogado na hora', async () => {
    const { service, accounts } = await registered();
    const phone2 = identity({ session: 'celular-2' });
    await rejects(service.activateSession(phone2, false), 'session_conflict');
    await service.activateSession(phone2, true);
    await rejects(service.authenticate(identity()), 'session_inactive');
    expect((await service.authenticate(phone2)).account.activeSession).toBe('celular-2');
    expect(accounts.events.at(-1)).toMatchObject({ type: 'session_activated', session: 'celular-2', replaced: 'celular-1' });
  });

  it('reativar o mesmo dispositivo não grava nada', async () => {
    const { service, accounts } = await registered();
    const before = accounts.events.length;
    await service.activateSession(identity(), false);
    expect(accounts.events).toHaveLength(before);
  });

  it('conta sem cadastro não autentica', async () => {
    await rejects(setup().service.authenticate(identity()), 'account_not_found');
  });
});

describe('papéis e Player ID', () => {
  it('jogador sem Player ID confirmado entra, mas ainda não age', async () => {
    const { service } = setup();
    await service.register(identity(), 'ana@example.com', { profile: adult, playerId: '100001' });
    expect((await service.authenticate(identity())).actor).toBeNull();
  });

  it('ADM confirma (e pode corrigir) o Player ID; aí o jogador vira ator', async () => {
    const { service } = setup();
    await service.register(identity(), 'ana@example.com', { profile: adult, playerId: '100009' });
    await service.confirmPlayerId(admin, 'conta-1', '100001');
    expect((await service.authenticate(identity())).actor).toEqual({ role: 'player', accountId: 'conta-1', playerId: '100001' });
  });

  it('só o ADM confirma Player ID', async () => {
    const { service } = setup();
    await service.register(identity(), 'ana@example.com', { profile: adult, playerId: '100001' });
    await rejects(service.confirmPlayerId({ role: 'judge', accountId: 'juiz' }, 'conta-1', '100001'), 'forbidden');
  });

  it('Player ID confirmado em outra conta é recusado', async () => {
    const { service } = setup();
    await service.register(identity(), 'ana@example.com', { profile: adult, playerId: '100001' });
    await service.register(identity({ accountId: 'conta-2', session: 's2' }), 'ana@example.com', { profile: adult, playerId: '100001' });
    await service.confirmPlayerId(admin, 'conta-1', '100001');
    await rejects(service.confirmPlayerId(admin, 'conta-2', '100001'), 'player_id_taken');
  });

  it('grupos do Cognito definem juiz e ADM', async () => {
    const { service } = setup();
    await service.register(identity(), 'ana@example.com', { profile: adult, playerId: null });
    expect((await service.authenticate(identity({ groups: ['judge'] }))).actor).toEqual({ role: 'judge', accountId: 'conta-1' });
    expect((await service.authenticate(identity({ groups: ['judge', 'admin'] }))).actor?.role).toBe('admin');
  });
});
