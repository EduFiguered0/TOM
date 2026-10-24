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
  login: 'login-email', session: 'celular-1', groups: [], provider: 'password', ...overrides,
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
    const account = await service.register(identity(), ' Ana@Example.com ', { profile: adult, playerId: ' 100001 ' });
    expect(account).toMatchObject({ email: 'ana@example.com', logins: ['login-email'] });
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

  it('recusa Player ID inválido e cadastro repetido (mesmo login ou mesmo e-mail)', async () => {
    const { service } = setup();
    await rejects(service.register(identity(), 'ana@example.com', { profile: adult, playerId: 'abc' }), 'invalid_input');
    await service.register(identity(), 'ana@example.com', { profile: adult, playerId: null });
    await rejects(service.register(identity(), 'outro@example.com', { profile: adult, playerId: null }), 'account_exists');
    await rejects(service.register(identity({ login: 'login-google' }), 'ANA@example.com', { profile: adult, playerId: null }), 'account_exists');
  });
});

describe('vários logins na mesma conta', () => {
  it('Google numa conta antiga (código por e-mail): liga pelo e-mail e cai na confirmação de dispositivo', async () => {
    const { service, accounts } = setup();
    const created = await service.register(identity(), 'ana@example.com', { profile: adult, playerId: null });
    // Contas de antes da senha não têm a marca: o código por e-mail já provou o dono.
    const account = { ...created };
    delete account.emailProven;
    await accounts.save(account, [], 1);
    const google = identity({ login: 'login-google', session: 'celular-1-google', provider: 'google' });
    await rejects(service.authenticate(google), 'account_not_found');

    expect((await service.linkLogin(google, 'Ana@Example.com')).logins).toEqual(['login-email', 'login-google']);
    expect(accounts.events.at(-1)).toMatchObject({ type: 'login_linked', login: 'login-google' });
    await rejects(service.authenticate(google), 'session_inactive');
    await service.activateSession(google, true);
    expect((await service.authenticate(google)).account.id).toBe(account.id);
  });

  it('ligar de novo não grava nada; e-mail sem conta não liga', async () => {
    const { service, accounts } = setup();
    await service.register(identity(), 'ana@example.com', { profile: adult, playerId: null });
    await service.linkLogin(identity(), 'ana@example.com');
    expect(accounts.events.filter((e) => e.type === 'login_linked')).toHaveLength(0);
    await rejects(service.linkLogin(identity({ login: 'x' }), 'outra@example.com'), 'account_not_found');
  });

  it('senha num e-mail que já tem conta: recusa e não liga', async () => {
    const { service } = setup();
    await service.register(identity({ login: 'login-google', provider: 'google' }), 'ana@example.com', { profile: adult, playerId: null });
    const senha = identity({ login: 'login-senha', provider: 'password' });
    await rejects(service.linkLogin(senha, 'Ana@Example.com'), 'account_exists');
    await rejects(service.authenticate(senha), 'account_not_found');
  });

  it('Google num e-mail cadastrado só com senha: o Google prova o dono e os logins de senha caem', async () => {
    const { service, accounts } = setup();
    const account = await service.register(identity({ login: 'senha-intruso', provider: 'password' }), 'ana@example.com', { profile: adult, playerId: null });
    expect(account.emailProven).toBe(false);
    const google = identity({ login: 'login-google', session: 'celular-ana', provider: 'google' });
    const linked = await service.linkLogin(google, 'ana@example.com');
    expect(linked).toMatchObject({ logins: ['login-google'], emailProven: true });
    expect(accounts.events.at(-1)).toMatchObject({ type: 'login_linked', login: 'login-google', dropped: ['senha-intruso'] });
    await rejects(service.authenticate(identity({ login: 'senha-intruso', provider: 'password' })), 'account_not_found');
  });

  it('conta criada pelo Google ou antiga (código por e-mail) mantém os logins ao ligar outro Google', async () => {
    const { service } = setup();
    expect((await service.register(identity({ login: 'g1', provider: 'google' }), 'a@example.com', { profile: adult, playerId: null })).emailProven).toBe(true);
    expect((await service.linkLogin(identity({ login: 'g2', provider: 'google' }), 'a@example.com')).logins).toEqual(['g1', 'g2']);
  });

  it('mensagem da recusa orienta a entrar com a conta existente', async () => {
    const { service } = setup();
    await service.register(identity({ login: 'a', provider: 'password' }), 'ana@example.com', { profile: adult, playerId: null });
    await expect(service.linkLogin(identity({ login: 'b', provider: 'password' }), 'ana@example.com'))
      .rejects.toThrow('Esse e-mail já tem conta pelo Google. Entre com o Google.');
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
    const { id } = await service.register(identity(), 'ana@example.com', { profile: adult, playerId: '100009' });
    await service.confirmPlayerId(admin, id, '100001');
    expect((await service.authenticate(identity())).actor).toEqual({ role: 'player', accountId: id, playerId: '100001' });
  });

  it('só o ADM consulta conta alheia e confirma Player ID', async () => {
    const { service } = setup();
    const { id } = await service.register(identity(), 'ana@example.com', { profile: adult, playerId: '100001' });
    expect((await service.getAccount(admin, id)).playerId).toEqual({ value: '100001', confirmed: false });
    await rejects(service.getAccount(null, id), 'forbidden');
    await rejects(service.getAccount(admin, 'conta-9'), 'account_not_found');
    await rejects(service.confirmPlayerId({ role: 'judge', accountId: 'juiz' }, id, '100001'), 'forbidden');
    await rejects(service.confirmPlayerId(null, id, '100001'), 'forbidden');
  });

  it('Player ID confirmado em outra conta é recusado', async () => {
    const { service } = setup();
    const first = await service.register(identity(), 'ana@example.com', { profile: adult, playerId: '100001' });
    const second = await service.register(identity({ login: 'login-2', session: 's2' }), 'bia@example.com', { profile: adult, playerId: '100001' });
    await service.confirmPlayerId(admin, first.id, '100001');
    await rejects(service.confirmPlayerId(admin, second.id, '100001'), 'player_id_taken');
  });

  it('grupos do Cognito definem juiz e ADM', async () => {
    const { service } = setup();
    const { id } = await service.register(identity(), 'ana@example.com', { profile: adult, playerId: null });
    expect((await service.authenticate(identity({ groups: ['judge'] }))).actor).toEqual({ role: 'judge', accountId: id });
    expect((await service.authenticate(identity({ groups: ['judge', 'admin'] }))).actor?.role).toBe('admin');
  });
});
