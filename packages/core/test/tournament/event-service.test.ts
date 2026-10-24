import { describe, expect, it } from 'vitest';
import { CommandRejected, EventService, hashToken, InMemoryEventRegistry, type RejectCode } from '../../src/index.js';
import { actors, TestClock } from './support.js';
import { eventRegistryContract } from './event-registry-contract.js';

eventRegistryContract('em memória', () => new InMemoryEventRegistry());

const setup = () => {
  const events = new InMemoryEventRegistry();
  let n = 0;
  return { events, service: new EventService({ events, clock: new TestClock(), ids: { next: () => `ev${String(++n)}` } }) };
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
