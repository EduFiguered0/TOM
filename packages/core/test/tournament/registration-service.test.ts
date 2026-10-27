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
    createdAt: new Date(), profile: { firstName: 'Nome', lastName: id, birthYear: 1990, phone: null, guardianConsent: false }, nameReviewed: true,
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
    expect(first.registration).toMatchObject({ accountId: 'ana', playerId: '100001', firstName: 'Nome', lastName: 'ana', birthYear: 1990, by: 'self', awaitingApproval: false });
    expect((await service.join(ana, code)).registration).toEqual(first.registration);
    await events.markRunning(event.id);
    expect((await service.join(ana, code)).registration).toEqual(first.registration);
  });

  it('com o resultado final, o QR fecha para quem não estava inscrito', async () => {
    const { service, accounts, events, event, code } = await setup();
    await events.markRunning(event.id);
    await events.markFinal(event.id, []);
    await rejects(service.join(await account(accounts, 'bia', '100002'), code), 'event_state', 'Inscrições encerradas');
  });

  it('resultado final chega entre a leitura e a gravação: a guarda recusa', async () => {
    const { service, accounts, events, registrations, event, code } = await setup();
    await events.markRunning(event.id);
    const put = registrations.put.bind(registrations);
    registrations.put = async (r, guard) => { await events.markFinal(event.id, []); return put(r, guard); };
    await rejects(service.join(await account(accounts, 'bia', '100002'), code), 'event_state', 'Inscrições encerradas');
  });

  it('rodada 1 começa entre a leitura e a gravação: inscreve aguardando o ADM, sem recusar', async () => {
    const { service, accounts, events, registrations, event, code } = await setup();
    const put = registrations.put.bind(registrations);
    let first = true;
    registrations.put = async (r, guard) => {
      if (first) { first = false; await events.markRunning(event.id); }
      return put(r, guard);
    };
    expect((await service.join(await account(accounts, 'bia', '100002'), code)).registration.awaitingApproval).toBe(true);
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

describe('entrada tardia e painel do ADM', () => {
  it('depois da rodada 1, o QR inscreve aguardando o ADM; aprovado, deixa de aguardar', async () => {
    const { service, accounts, events, event, code } = await setup();
    await events.markRunning(event.id);
    const bia = await account(accounts, 'bia', '100002');
    expect((await service.join(bia, code)).registration).toMatchObject({ by: 'self', awaitingApproval: true });
    expect(await service.awaiting(event.id)).toBe(1);
    expect((await service.approve(actors.admin, event.id, 'bia')).awaitingApproval).toBe(false);
    expect((await service.join(bia, code)).registration.awaitingApproval).toBe(false);
    expect(await service.awaiting(event.id)).toBe(0);
  });

  it('recusar é remover: escanear de novo não reabre o pedido', async () => {
    const { service, accounts, events, event, code } = await setup();
    await events.markRunning(event.id);
    const bia = await account(accounts, 'bia', '100002');
    await service.join(bia, code);
    await service.remove(actors.admin, event.id, 'bia');
    expect(await service.awaiting(event.id)).toBe(0);
    await rejects(service.join(bia, code), 'forbidden', 'Sua inscrição foi removida, procure o ADM');
  });

  it('só o ADM aprova', async () => {
    const { service, accounts, events, event, code } = await setup();
    await events.markRunning(event.id);
    await service.join(await account(accounts, 'bia', '100002'), code);
    await rejects(service.approve(actors.p1, event.id, 'bia'), 'forbidden');
    await rejects(service.approve(actors.admin, event.id, 'ninguem'), 'account_not_found');
  });

  it('ADM inscreve à mão durante a rodada sem esperar aprovação', async () => {
    const { service, accounts, events, event } = await setup();
    await account(accounts, 'tarde', '100004');
    await events.markRunning(event.id);
    expect((await service.add(actors.admin, event.id, 'tarde')).awaitingApproval).toBe(false);
  });

  it('pagamento: nasce não pago; só o ADM marca, até o encerramento', async () => {
    const { service, accounts, events, event, code } = await setup();
    expect((await service.join(await account(accounts, 'ana', '100001'), code)).registration.paid).toBe(false);
    await rejects(service.setPaid(actors.p1, event.id, 'ana', true), 'forbidden');
    expect((await service.setPaid(actors.admin, event.id, 'ana', true)).paid).toBe(true);
    await events.markRunning(event.id);
    await events.markFinal(event.id, []);
    expect((await service.setPaid(actors.admin, event.id, 'ana', false)).paid).toBe(false);
    await events.close(actors.admin, event.id);
    await rejects(service.setPaid(actors.admin, event.id, 'ana', true), 'event_state', 'Evento encerrado: o pagamento não muda mais');
  });

  it('histórico do jogador: eventos mais recentes primeiro, sem removidos, com o nome atual; só o ADM vê', async () => {
    const { service, accounts, events, registry, event, code } = await setup();
    const ana = await account(accounts, 'ana', '100001');
    await service.join(ana, code);
    await service.setPaid(actors.admin, event.id, 'ana', true);
    await events.markRunning(event.id);
    await events.markFinal(event.id, []);
    await events.close(actors.admin, event.id);
    const { event: next } = await events.createEvent(actors.admin, { label: 'Segunda', date: '2026-10-30' });
    await service.join(ana, next.code ?? '');
    const record = await registry.get(next.id);
    if (!record) throw new Error('evento não gravado');
    await registry.save({ ...record.event, label: 'Nome do TOM' }, record.version);
    await rejects(service.history(actors.p1, 'ana'), 'forbidden');
    expect(await service.history(actors.admin, 'ana')).toEqual([
      { eventId: next.id, label: 'Nome do TOM', date: '2026-10-30', paid: false },
      { eventId: event.id, label: 'Liga de Outubro', date: event.date, paid: true },
    ]);
    await service.remove(actors.admin, next.id, 'ana');
    expect((await service.history(actors.admin, 'ana')).map((h) => h.eventId)).toEqual([event.id]);
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

describe('alterações simultâneas na inscrição', () => {
  it('pago, lançado e remoção ao mesmo tempo: nenhuma desfaz a outra', async () => {
    const { service, accounts, event, code } = await setup();
    await service.join(await account(accounts, 'ana', '100001'), code);
    await Promise.all([
      service.setPaid(actors.admin, event.id, 'ana', true),
      service.setLaunched(actors.admin, event.id, 'ana', true),
      service.remove(actors.admin, event.id, 'ana'),
    ]);
    expect((await service.list(actors.admin, event.id))[0]).toMatchObject({ paid: true, launched: true, removed: true });
  });

  it('evento cancelado não entra no histórico do jogador', async () => {
    const { service, accounts, events, event, code } = await setup();
    await service.join(await account(accounts, 'ana', '100001'), code);
    await events.cancel(actors.admin, event.id);
    expect(await service.history(actors.admin, 'ana')).toEqual([]);
  });
});
