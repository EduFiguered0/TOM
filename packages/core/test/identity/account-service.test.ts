import { describe, expect, it } from 'vitest';
import {
  AccountService,
  CommandRejected,
  fullName,
  InMemoryAccountRepository,
  splitName,
  type Identity,
  type Profile,
  type RejectCode,
  toPlayerId,
} from '../../src/index.js';
import { TestClock } from '../tournament/support.js';
import { accountRepositoryContract } from './account-repository-contract.js';

accountRepositoryContract('em memória', () => new InMemoryAccountRepository());

const adult: Profile = { firstName: '  Ana ', lastName: '  Souza   Lima ', birthYear: 1990, phone: '(11) 98888-7777', guardianConsent: false };
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
  it('normaliza o perfil, grava o Player ID e ativa o primeiro dispositivo', async () => {
    const { service, accounts } = setup();
    const account = await service.register(identity(), ' Ana@Example.com ', { profile: adult, playerId: ' 100001 ' });
    expect(account).toMatchObject({ email: 'ana@example.com', logins: ['login-email'] });
    expect(account.profile).toEqual({ firstName: 'Ana', lastName: 'Souza Lima', birthYear: 1990, phone: '11988887777', guardianConsent: false });
    expect(account.nameReviewed).toBe(true);
    expect(account.playerId).toBe('100001');
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
    ['nome vazio', { firstName: '  ' }],
    ['sobrenome vazio', { lastName: '' }],
    ['nome longo', { firstName: 'a'.repeat(51) }],
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

describe('nome e sobrenome', () => {
  it('separa no primeiro espaço e junta sem espaço sobrando', () => {
    expect(splitName('João da Silva')).toEqual({ firstName: 'João', lastName: 'da Silva' });
    expect(splitName('  Madonna ')).toEqual({ firstName: 'Madonna', lastName: '' });
    expect(fullName({ firstName: 'Madonna', lastName: '' })).toBe('Madonna');
    expect(fullName({ firstName: 'João', lastName: 'da Silva' })).toBe('João da Silva');
  });

  it('mensagens de nome e sobrenome inválidos', async () => {
    const { service } = setup();
    const register = (change: Partial<Profile>) => service.register(identity(), 'ana@example.com', { profile: { ...adult, ...change }, playerId: null });
    await expect(register({ firstName: '' })).rejects.toThrow('Nome deve ter de 1 a 50 caracteres');
    await expect(register({ lastName: ' ' })).rejects.toThrow('Sobrenome deve ter de 1 a 50 caracteres');
  });

  /** Conta antiga, lida com o nome separado e ainda não conferida. */
  const legacy = async () => {
    const ctx = setup();
    const account = await ctx.service.register(identity(), 'ana@example.com', { profile: adult, playerId: null });
    const record = await ctx.accounts.get(account.id);
    await ctx.accounts.save({ ...account, profile: { ...account.profile, firstName: 'Madonna', lastName: '' }, nameReviewed: false }, [], record?.version ?? 0);
    return { ...ctx, account };
  };

  it('conta antiga confere o nome uma vez; sem sobrenome não salva', async () => {
    const { service, accounts } = await legacy();
    await rejects(service.confirmName(identity(), { firstName: 'Madonna', lastName: '' }), 'invalid_input');
    const saved = await service.confirmName(identity(), { firstName: ' Madonna ', lastName: ' Ciccone ' });
    expect(saved).toMatchObject({ profile: { firstName: 'Madonna', lastName: 'Ciccone', birthYear: 1990 }, nameReviewed: true });
    expect(accounts.events.at(-1)).toMatchObject({ type: 'name_confirmed', actor: { role: 'system', source: 'login:login-email' } });
  });

  it('ativar a sessão não marca o nome como conferido', async () => {
    const { service } = await legacy();
    await service.activateSession(identity({ session: 'celular-2' }), true);
    expect((await service.authenticate(identity({ session: 'celular-2' }))).account.nameReviewed).toBe(false);
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
  const other = identity({ login: 'login-2', session: 's2' });

  it('cadastro com Player ID já age como jogador', async () => {
    const { service } = setup();
    const { id } = await service.register(identity(), 'ana@example.com', { profile: adult, playerId: '100001' });
    expect((await service.authenticate(identity())).actor).toEqual({ role: 'player', accountId: id, playerId: '100001' });
  });

  it('Player ID em uso no cadastro: recusa com a mensagem e não grava a conta', async () => {
    const { service } = setup();
    await service.register(identity(), 'ana@example.com', { profile: adult, playerId: '100001' });
    const second = service.register(other, 'bia@example.com', { profile: adult, playerId: '100001' });
    await rejects(second, 'player_id_taken');
    await expect(second).rejects.toThrow('Esse Player ID já está em uso, procure o ADM');
    await rejects(service.authenticate(other), 'account_not_found');
  });

  it('conta sem Player ID informa depois; com Player ID, só o ADM troca', async () => {
    const { service, accounts } = setup();
    const { id } = await service.register(identity(), 'ana@example.com', { profile: adult, playerId: null });
    expect((await service.authenticate(identity())).actor).toBeNull();
    expect((await service.claimPlayerId(identity(), ' 100001 ')).playerId).toBe('100001');
    expect(accounts.events.at(-1)).toMatchObject({ type: 'player_id_claimed', playerId: '100001' });
    expect((await service.authenticate(identity())).actor).toEqual({ role: 'player', accountId: id, playerId: '100001' });
    const again = service.claimPlayerId(identity(), '100002');
    await rejects(again, 'player_id_set');
    await expect(again).rejects.toThrow('Seu Player ID já está cadastrado. Para trocar, procure o ADM.');
  });

  it('informar depois um Player ID em uso é recusado com a mensagem', async () => {
    const { service } = setup();
    await service.register(identity(), 'ana@example.com', { profile: adult, playerId: '100001' });
    await service.register(other, 'bia@example.com', { profile: adult, playerId: null });
    const claim = service.claimPlayerId(other, '100001');
    await rejects(claim, 'player_id_taken');
    await expect(claim).rejects.toThrow('Esse Player ID já está em uso, procure o ADM');
  });

  it('ADM desfaz o vínculo: a conta perde o poder de agir e o dono verdadeiro cadastra o mesmo Player ID', async () => {
    const { service, accounts } = setup();
    await service.register(identity(), 'ana@example.com', { profile: adult, playerId: '100001' });
    expect((await service.findByPlayerId(admin, '100001')).email).toBe('ana@example.com');
    expect((await service.unlinkPlayerId(admin, '100001')).playerId).toBeNull();
    expect(accounts.events.at(-1)).toMatchObject({ type: 'player_id_unlinked', playerId: '100001', actor: admin });
    expect((await service.authenticate(identity())).actor).toBeNull();
    expect((await service.register(other, 'bia@example.com', { profile: adult, playerId: '100001' })).playerId).toBe('100001');
  });

  it('só o ADM busca e desfaz; Player ID sem conta dá 404', async () => {
    const { service } = setup();
    await service.register(identity(), 'ana@example.com', { profile: adult, playerId: '100001' });
    const player = { role: 'player', accountId: 'x', playerId: toPlayerId('100002') } as const;
    await rejects(service.findByPlayerId(player, '100001'), 'forbidden');
    await rejects(service.unlinkPlayerId(player, '100001'), 'forbidden');
    await rejects(service.findByPlayerId(null, '100001'), 'forbidden');
    await rejects(service.findByPlayerId(admin, '999999'), 'account_not_found');
    await expect(service.findByPlayerId(admin, '999999')).rejects.toThrow('Nenhuma conta com esse Player ID');
    await rejects(service.unlinkPlayerId(admin, '999999'), 'account_not_found');
  });

  it('grupo admin do Cognito define o ADM; o grupo judge não vale mais', async () => {
    const { service } = setup();
    const { id } = await service.register(identity(), 'ana@example.com', { profile: adult, playerId: '100001' });
    expect((await service.authenticate(identity({ groups: ['judge'] }))).actor).toEqual({ role: 'player', accountId: id, playerId: '100001' });
    expect((await service.authenticate(identity({ groups: ['judge', 'admin'] }))).actor).toEqual({ role: 'admin', accountId: id });
  });
});

describe('equipe', () => {
  const joao = identity({ login: 'l-joao', session: 'sj' });
  const maria = identity({ login: 'l-maria', session: 'sm' });
  const team = async () => {
    const ctx = setup();
    const j = await ctx.service.register(joao, 'joao@example.com', { profile: { ...adult, firstName: 'João', lastName: 'Silva' }, playerId: '100001' });
    const m = await ctx.service.register(maria, 'maria@example.com', { profile: { ...adult, firstName: 'Maria', lastName: 'Joana' }, playerId: '100002' });
    return { ...ctx, j, m };
  };

  it('ADM marca e desmarca juiz; fica registrado', async () => {
    const { service, accounts, j } = await team();
    expect((await service.setJudge(admin, j.id, true)).judge).toBe(true);
    expect(accounts.events.at(-1)).toMatchObject({ type: 'judge_set', judge: true, actor: admin, accountId: j.id });
    const before = accounts.events.length;
    await service.setJudge(admin, j.id, true);
    expect(accounts.events).toHaveLength(before);
    expect((await service.setJudge(admin, j.id, false)).judge).toBe(false);
  });

  it('juiz precisa de Player ID', async () => {
    const { service } = setup();
    const { id } = await service.register(identity(), 'ana@example.com', { profile: adult, playerId: null });
    const marking = service.setJudge(admin, id, true);
    await rejects(marking, 'invalid_input');
    await expect(marking).rejects.toThrow('O juiz precisa ter Player ID cadastrado');
  });

  it('só o ADM mexe na equipe', async () => {
    const { service, j } = await team();
    const player = { role: 'player', accountId: j.id, playerId: toPlayerId('100001') } as const;
    await rejects(service.setJudge(player, j.id, true), 'forbidden');
    await rejects(service.search(player, 'joao'), 'forbidden');
    await rejects(service.listJudges(null), 'forbidden');
  });

  it('busca por nome sem acento e por Player ID exato', async () => {
    const { service } = await team();
    const names = async (q: string) => (await service.search(admin, q)).map((a) => fullName(a.profile));
    expect(await names('joao')).toEqual(['João Silva']);
    expect(await names('JO')).toEqual(['João Silva', 'Maria Joana']);
    expect(await names('100002')).toEqual(['Maria Joana']);
    expect(await names('1000')).toEqual([]);
    expect(await names('silva')).toEqual(['João Silva']);
    const short = service.search(admin, ' a ');
    await rejects(short, 'invalid_input');
    await expect(short).rejects.toThrow('Digite pelo menos 2 caracteres');
  });

  it('lista os juízes da equipe', async () => {
    const { service, j } = await team();
    expect(await service.listJudges(admin)).toEqual([]);
    await service.setJudge(admin, j.id, true);
    expect((await service.listJudges(admin)).map((a) => a.id)).toEqual([j.id]);
  });

  it('marcar conta inexistente dá 404', async () => {
    await rejects(setup().service.setJudge(admin, 'nao-existe', true), 'account_not_found');
  });
});
