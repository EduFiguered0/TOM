import { describe, expect, it } from 'vitest';
import {
  CommandRejected,
  EventService,
  InMemoryAccountRepository,
  InMemoryEventRegistry,
  InMemoryRegistrationRepository,
  RegistrationService,
  toPlayerId,
  type Account,
  type Principal,
  type RejectCode,
} from '../../src/index.js';
import { actors, TestClock } from './support.js';

const setup = async () => {
  const registry = new InMemoryEventRegistry();
  const accounts = new InMemoryAccountRepository();
  const registrations = new InMemoryRegistrationRepository(registry);
  const clock = new TestClock();
  let n = 0;
  const ids = { next: () => `id${String(++n)}` };
  const events = new EventService({ events: registry, accounts, registrations, clock, ids });
  const service = new RegistrationService({ registry, registrations, accounts, clock });
  const { event } = await events.createEvent(actors.admin, { label: 'Liga de Outubro' });
  return { registry, accounts, registrations, events, service, event, code: event.code ?? '' };
};

const account = async (accounts: InMemoryAccountRepository, id: string, playerId: string | null, judge = false): Promise<Principal> => {
  const a: Account = {
    id, email: `${id}@example.com`, logins: [id], playerId: playerId ? toPlayerId(playerId) : null, activeSession: 's', judge,
    createdAt: new Date(), profile: { name: `Nome ${id}`, birthYear: 1990, phone: null, guardianConsent: false },
  };
  await accounts.save(a, [], 0);
  return { account: a, actor: playerId ? { role: 'player', accountId: id, playerId: toPlayerId(playerId) } : null };
};

const rejects = async (promise: Promise<unknown>, code: RejectCode, message?: string) => {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(CommandRejected);
  expect((error as CommandRejected).code).toBe(code);
  if (message) expect((error as CommandRejected).message).toBe(message);
};

describe('inscrição pelo QR', () => {
  it('escanear inscreve; de novo devolve a mesma, mesmo com as inscrições fechadas', async () => {
    const { service, accounts, events, event, code } = await setup();
    const ana = await account(accounts, 'ana', '100001');
    const first = await service.join(ana, code);
    expect(first.registration).toMatchObject({ accountId: 'ana', playerId: '100001', name: 'Nome ana', birthYear: 1990, by: 'self', confirmed: false });
    expect((await service.join(ana, code)).registration).toEqual(first.registration);
    await events.requestConfirmation(actors.admin, event.id);
    expect((await service.join(ana, code)).registration.accountId).toBe('ana');
  });

  it('inscrições fechadas para quem não estava inscrito', async () => {
    const { service, accounts, events, event, code } = await setup();
    await events.requestConfirmation(actors.admin, event.id);
    await rejects(service.join(await account(accounts, 'bia', '100002'), code), 'event_state', 'Inscrições encerradas');
  });

  it('código desconhecido e cadastro sem Player ID', async () => {
    const { service, accounts, code } = await setup();
    await rejects(service.join(await account(accounts, 'ana', '100001'), 'XXXXXXXX'), 'event_not_found', 'Evento não encontrado');
    await rejects(service.join(await account(accounts, 'sem', null), code), 'invalid_input', 'Complete o cadastro com o Player ID para se inscrever');
  });

  it('juiz escalado não se inscreve; inscrito não é escalado', async () => {
    const { service, accounts, events, event, code } = await setup();
    const juiz = await account(accounts, 'juiz', '100009', true);
    await events.update(actors.admin, event.id, { judges: ['juiz'] });
    await rejects(service.join(juiz, code), 'forbidden', 'Você é juiz deste evento');
    const outro = await account(accounts, 'outro', '100008', true);
    await service.join(outro, code);
    await rejects(events.update(actors.admin, event.id, { judges: ['juiz', 'outro'] }), 'invalid_input',
      'Essa conta está inscrita no evento. Remova a inscrição antes de escalar.');
    await service.remove(actors.admin, event.id, 'outro');
    expect((await events.update(actors.admin, event.id, { judges: ['juiz', 'outro'] })).judges).toEqual(['juiz', 'outro']);
  });

  it('removido não volta pelo QR; o ADM reinscreve', async () => {
    const { service, accounts, event, code } = await setup();
    const ana = await account(accounts, 'ana', '100001');
    await service.join(ana, code);
    await service.remove(actors.admin, event.id, 'ana');
    await rejects(service.join(ana, code), 'forbidden', 'Sua inscrição foi removida, procure o ADM');
    expect(await service.add(actors.admin, event.id, 'ana')).toMatchObject({ removed: false, by: 'admin' });
    expect((await service.join(ana, code)).registration.removed).toBe(false);
  });
});

describe('confirmação de presença e painel do ADM', () => {
  it('o próprio só confirma na fase de confirmação; o ADM confirma por ele', async () => {
    const { service, accounts, events, event, code } = await setup();
    const ana = await account(accounts, 'ana', '100001');
    const bia = await account(accounts, 'bia', '100002');
    await service.join(ana, code);
    await service.join(bia, code);
    await rejects(service.confirm(ana, event.id), 'event_state', 'A confirmação de presença não está aberta');
    await events.requestConfirmation(actors.admin, event.id);
    expect(await service.pending(event.id)).toBe(2);
    expect((await service.confirm(ana, event.id)).confirmed).toBe(true);
    expect((await service.confirmFor(actors.admin, event.id, 'bia')).confirmed).toBe(true);
    expect(await service.pending(event.id)).toBe(0);
  });

  it('atrasado inscrito pelo ADM já entra confirmado; antes da confirmação, não', async () => {
    const { service, accounts, events, event } = await setup();
    await account(accounts, 'cedo', '100003');
    await account(accounts, 'tarde', '100004');
    expect((await service.add(actors.admin, event.id, 'cedo')).confirmed).toBe(false);
    await events.requestConfirmation(actors.admin, event.id);
    expect((await service.add(actors.admin, event.id, 'tarde')).confirmed).toBe(true);
  });

  it('pendentes não contam os removidos', async () => {
    const { service, accounts, events, event, code } = await setup();
    await service.join(await account(accounts, 'ana', '100001'), code);
    await service.join(await account(accounts, 'bia', '100002'), code);
    await events.requestConfirmation(actors.admin, event.id);
    await service.remove(actors.admin, event.id, 'bia');
    expect(await service.pending(event.id)).toBe(1);
  });

  it('só o ADM lista, remove, marca lançado e inscreve à mão', async () => {
    const { service, accounts, event, code } = await setup();
    const ana = await account(accounts, 'ana', '100001');
    await service.join(ana, code);
    await rejects(service.list(actors.p1, event.id), 'forbidden');
    await rejects(service.remove(actors.p1, event.id, 'ana'), 'forbidden');
    await rejects(service.setLaunched(null, event.id, 'ana', true), 'forbidden');
    await rejects(service.add(actors.p1, event.id, 'ana'), 'forbidden');
    expect((await service.setLaunched(actors.admin, event.id, 'ana', true)).launched).toBe(true);
    expect((await service.list(actors.admin, event.id)).map((r) => r.accountId)).toEqual(['ana']);
    await rejects(service.setLaunched(actors.admin, event.id, 'ninguem', true), 'account_not_found');
  });

  it('a própria inscrição no evento ativo', async () => {
    const { service, accounts, event, code } = await setup();
    const ana = await account(accounts, 'ana', '100001');
    expect(await service.mine(ana)).toMatchObject({ event: { id: event.id }, registration: null });
    await service.join(ana, code);
    expect((await service.mine(ana))?.registration?.accountId).toBe('ana');
  });

  it('desfazer vínculo derruba a inscrição', async () => {
    const { service, accounts, event, code } = await setup();
    await service.join(await account(accounts, 'ana', '100001'), code);
    await service.dropAccount(event.id, 'ana');
    expect((await service.list(actors.admin, event.id))[0]?.removed).toBe(true);
    await service.dropAccount(event.id, 'ninguem');
  });
});
