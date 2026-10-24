import { describe, expect, it } from 'vitest';
import {
  CommandRejected,
  EventService,
  hashToken,
  InMemoryAccountRepository,
  InMemoryEventRegistry,
  type Account,
  type RejectCode,
} from '../../src/index.js';
import { actors, TestClock } from './support.js';
import { eventRegistryContract } from './event-registry-contract.js';

eventRegistryContract('em memória', () => new InMemoryEventRegistry());

const setup = () => {
  const events = new InMemoryEventRegistry();
  const accounts = new InMemoryAccountRepository();
  let n = 0;
  return { events, accounts, service: new EventService({ events, accounts, clock: new TestClock(), ids: { next: () => `ev${String(++n)}` } }) };
};

/** Conta gravada direto no repositório; `judge` = juiz da equipe. */
const member = async (accounts: InMemoryAccountRepository, id: string, judge: boolean) => {
  const account: Account = {
    id, email: `${id}@example.com`, logins: [id], playerId: null, activeSession: null, createdAt: new Date(), judge,
    profile: { name: id, birthYear: 1990, phone: null, guardianConsent: false },
  };
  await accounts.save(account, [], 0);
  return id;
};

const rejects = async (promise: Promise<unknown>, code: RejectCode) => {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(CommandRejected);
  expect((error as CommandRejected).code).toBe(code);
};

describe('evento e token do enviador', () => {
  it('só o ADM cria; o token aparece uma vez e o banco guarda só o hash', async () => {
    const { service, events } = setup();
    await rejects(service.createEvent(actors.judge, 'Liga'), 'forbidden');
    await rejects(service.createEvent(null, 'Liga'), 'forbidden');
    const { event, token } = await service.createEvent(actors.admin, '  Liga de Outubro ');
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(event).toMatchObject({ label: 'Liga de Outubro', tournament: null, revoked: false, createdBy: 'adm' });
    const stored = await events.get(event.id);
    expect(stored?.event.tokenHash).toBe(await hashToken(token));
    expect(JSON.stringify(stored)).not.toContain(token);
  });

  it('primeiro envio amarra o torneio do TOM; outro torneio com o mesmo token é recusado', async () => {
    const { service } = setup();
    const { token } = await service.createEvent(actors.admin, 'Liga');
    expect((await service.authorizeUpload(token, 'FODASE')).tournament).toBe('FODASE');
    expect((await service.authorizeUpload(token, 'FODASE')).tournament).toBe('FODASE');
    await rejects(service.authorizeUpload(token, 'Outro torneio'), 'tournament_mismatch');
  });

  it('token desconhecido, vazio ou revogado é recusado', async () => {
    const { service } = setup();
    const { event, token } = await service.createEvent(actors.admin, 'Liga');
    await rejects(service.authorizeUpload('inventado', 'FODASE'), 'invalid_token');
    await rejects(service.authorizeUpload('', 'FODASE'), 'invalid_token');
    await rejects(service.revoke(actors.judge, event.id), 'forbidden');
    await service.revoke(actors.admin, event.id);
    await rejects(service.authorizeUpload(token, 'FODASE'), 'invalid_token');
    await rejects(service.revoke(actors.admin, 'nao-existe'), 'event_not_found');
  });

  it('dois arquivos chegando juntos no primeiro envio não brigam pelo torneio', async () => {
    const { service } = setup();
    const { token } = await service.createEvent(actors.admin, 'Liga');
    const results = await Promise.all([service.authorizeUpload(token, 'FODASE'), service.authorizeUpload(token, 'FODASE')]);
    expect(results.map((e) => e.tournament)).toEqual(['FODASE', 'FODASE']);
  });
});

describe('escala de juízes', () => {
  it('cria com juízes da equipe', async () => {
    const { service, accounts } = setup();
    const juiz = await member(accounts, 'juiz', true);
    expect((await service.createEvent(actors.admin, 'Liga', [juiz])).event.judges).toEqual([juiz]);
    expect((await service.createEvent(actors.admin, 'Liga')).event.judges).toEqual([]);
  });

  it('recusa escalar quem não é juiz da equipe; nada é gravado', async () => {
    const { service, accounts, events } = setup();
    const comum = await member(accounts, 'comum', false);
    const creating = service.createEvent(actors.admin, 'Liga', [comum]);
    await rejects(creating, 'invalid_input');
    await expect(creating).rejects.toThrow('Só juízes da equipe podem ser escalados');
    await rejects(service.createEvent(actors.admin, 'Liga', ['nao-existe']), 'invalid_input');
    expect(await events.get('ev1')).toBeNull();
  });

  it('ADM troca a escala; repetidos viram um', async () => {
    const { service, accounts } = setup();
    const juiz = await member(accounts, 'juiz', true);
    const { event } = await service.createEvent(actors.admin, 'Liga');
    expect((await service.setJudges(actors.admin, event.id, [juiz, juiz])).judges).toEqual([juiz]);
    expect((await service.setJudges(actors.admin, event.id, [])).judges).toEqual([]);
    await rejects(service.setJudges(actors.admin, 'nao-existe', []), 'event_not_found');
  });

  it('só o ADM escala', async () => {
    const { service } = setup();
    const { event } = await service.createEvent(actors.admin, 'Liga');
    await rejects(service.setJudges(actors.p1, event.id, []), 'forbidden');
    await rejects(service.setJudges(null, event.id, []), 'forbidden');
  });
});
