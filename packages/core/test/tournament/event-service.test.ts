import { describe, expect, it } from 'vitest';
import {
  CommandRejected,
  EventService,
  hashToken,
  InMemoryAccountRepository,
  InMemoryEventRegistry,
  InMemoryRegistrationRepository,
  type Account,
  type FinalStanding,
  type RejectCode,
} from '../../src/index.js';
import { actors, TestClock } from './support.js';
import { eventRegistryContract } from './event-registry-contract.js';

eventRegistryContract('em memória', () => new InMemoryEventRegistry());

const setup = () => {
  const events = new InMemoryEventRegistry();
  const accounts = new InMemoryAccountRepository();
  let n = 0;
  return { events, accounts, service: new EventService({ events, accounts, registrations: new InMemoryRegistrationRepository(events), clock: new TestClock(), ids: { next: () => `ev${String(++n)}` } }) };
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

const rejects = async (promise: Promise<unknown>, code: RejectCode, message?: string) => {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(CommandRejected);
  expect((error as CommandRejected).code).toBe(code);
  if (message) expect((error as CommandRejected).message).toBe(message);
};

const standings: FinalStanding[] = [{
  division: 'Divisão Mestre', rank: 1, name: 'teste5 5', wins: 3, losses: 0, ties: 0, points: 9, opponentWinPct: 50, opponentsOpponentWinPct: 58.33,
}];

describe('evento e token do enviador', () => {
  it('só o ADM cria; o token aparece uma vez e o banco guarda só o hash', async () => {
    const { service, events } = setup();
    await rejects(service.createEvent(actors.judge, { label: 'Liga' }), 'forbidden');
    await rejects(service.createEvent(null, { label: 'Liga' }), 'forbidden');
    const { event, token } = await service.createEvent(actors.admin, { label: '  Liga de Outubro ' });
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(event).toMatchObject({ label: 'Liga de Outubro', tournament: null, revoked: false, createdBy: 'adm' });
    const stored = await events.get(event.id);
    expect(stored?.event.tokenHash).toBe(await hashToken(token));
    expect(JSON.stringify(stored)).not.toContain(token);
  });

  it('cria aberto, com código, data de hoje e 30 min', async () => {
    const { service, events } = setup();
    const { event } = await service.createEvent(actors.admin, { label: 'Liga' });
    expect(event).toMatchObject({ status: 'open', date: '2026-10-23', roundMinutes: 30, standings: null });
    expect(event.code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/);
    expect((await events.findByCode(event.code ?? ''))?.event.id).toBe(event.id);
    expect((await service.active())?.id).toBe(event.id);
  });

  it('tempo de rodada e data validados', async () => {
    const { service } = setup();
    await rejects(service.createEvent(actors.admin, { label: 'Liga', roundMinutes: 5 }), 'invalid_input', 'Tempo de rodada deve ser de 10 a 180 minutos');
    await rejects(service.createEvent(actors.admin, { label: 'Liga', date: '2026-13-40' }), 'invalid_input', 'Data inválida');
    const { event } = await service.createEvent(actors.admin, { label: 'Liga', date: '2026-11-07', roundMinutes: 50 });
    expect(event).toMatchObject({ date: '2026-11-07', roundMinutes: 50 });
  });

  it('um evento ativo por vez; encerrado ou cancelado libera o próximo', async () => {
    const { service } = setup();
    const { event } = await service.createEvent(actors.admin, { label: 'Liga' });
    await rejects(service.createEvent(actors.admin, { label: 'Outra' }), 'event_active', 'Já existe um evento ativo. Encerre ou cancele antes de criar outro.');
    await service.cancel(actors.admin, event.id);
    expect(await service.active()).toBeNull();
    expect((await service.createEvent(actors.admin, { label: 'Outra' })).event.status).toBe('open');
  });

  it('ciclo: abre → em andamento → final → encerrado', async () => {
    const { service } = setup();
    const { event } = await service.createEvent(actors.admin, { label: 'Liga' });
    expect((await service.markRunning(event.id)).status).toBe('running');
    await rejects(service.markRunning(event.id), 'event_state', 'O evento já está em andamento');
    expect((await service.markFinal(event.id, standings)).status).toBe('final');
    expect((await service.close(actors.admin, event.id)).status).toBe('closed');
    expect(await service.active()).toBeNull();
  });

  it('só encerra depois do resultado final', async () => {
    const { service } = setup();
    const { event } = await service.createEvent(actors.admin, { label: 'Liga' });
    await rejects(service.close(actors.admin, event.id), 'event_state', 'O evento só encerra depois do resultado final do TOM');
  });

  it('cancela a qualquer momento antes de encerrar; depois não muda', async () => {
    const { service } = setup();
    const { event } = await service.createEvent(actors.admin, { label: 'Liga' });
    await service.markRunning(event.id);
    expect((await service.cancel(actors.admin, event.id)).status).toBe('cancelled');
    await rejects(service.cancel(actors.admin, event.id), 'event_state', 'Evento encerrado ou cancelado não muda');
    await rejects(service.update(actors.admin, event.id, { roundMinutes: 40 }), 'event_state', 'Evento encerrado ou cancelado não muda');
  });

  it('standings antes de iniciar não marcam final', async () => {
    const { service } = setup();
    const { event } = await service.createEvent(actors.admin, { label: 'Liga' });
    expect((await service.markFinal(event.id, standings)).status).toBe('open');
    await service.markRunning(event.id);
    expect(await service.markFinal(event.id, standings)).toMatchObject({ status: 'final', standings });
  });

  it('ADM muda o tempo de rodada enquanto o evento está ativo', async () => {
    const { service } = setup();
    const { event } = await service.createEvent(actors.admin, { label: 'Liga' });
    expect((await service.update(actors.admin, event.id, { roundMinutes: 45 })).roundMinutes).toBe(45);
    await rejects(service.update(actors.admin, event.id, { roundMinutes: 500 }), 'invalid_input');
  });

  it('primeiro envio amarra o torneio do TOM; outro torneio com o mesmo token é recusado', async () => {
    const { service } = setup();
    const { token } = await service.createEvent(actors.admin, { label: 'Liga' });
    expect((await service.authorizeUpload(token, 'FODASE')).tournament).toBe('FODASE');
    expect((await service.authorizeUpload(token, 'FODASE')).tournament).toBe('FODASE');
    await rejects(service.authorizeUpload(token, 'Outro torneio'), 'tournament_mismatch');
  });

  it('token desconhecido, vazio ou revogado é recusado', async () => {
    const { service } = setup();
    const { event, token } = await service.createEvent(actors.admin, { label: 'Liga' });
    await rejects(service.authorizeUpload('inventado', 'FODASE'), 'invalid_token');
    await rejects(service.authorizeUpload('', 'FODASE'), 'invalid_token');
    await rejects(service.revoke(actors.judge, event.id), 'forbidden');
    await service.revoke(actors.admin, event.id);
    await rejects(service.authorizeUpload(token, 'FODASE'), 'invalid_token');
    await rejects(service.revoke(actors.admin, 'nao-existe'), 'event_not_found');
  });

  it('token de evento cancelado não envia', async () => {
    const { service } = setup();
    const { event, token } = await service.createEvent(actors.admin, { label: 'Liga' });
    await service.cancel(actors.admin, event.id);
    await rejects(service.authorizeUpload(token, 'FODASE'), 'invalid_token');
  });

  it('dois arquivos chegando juntos no primeiro envio não brigam pelo torneio', async () => {
    const { service } = setup();
    const { token } = await service.createEvent(actors.admin, { label: 'Liga' });
    const results = await Promise.all([service.authorizeUpload(token, 'FODASE'), service.authorizeUpload(token, 'FODASE')]);
    expect(results.map((e) => e.tournament)).toEqual(['FODASE', 'FODASE']);
  });
});

describe('escala de juízes', () => {
  it('cria com juízes da equipe', async () => {
    const { service, accounts } = setup();
    const juiz = await member(accounts, 'juiz', true);
    expect((await service.createEvent(actors.admin, { label: 'Liga', judges: [juiz] })).event.judges).toEqual([juiz]);
  });

  it('recusa escalar quem não é juiz da equipe; nada é gravado', async () => {
    const { service, accounts, events } = setup();
    const comum = await member(accounts, 'comum', false);
    await rejects(service.createEvent(actors.admin, { label: 'Liga', judges: [comum] }), 'invalid_input', 'Só juízes da equipe podem ser escalados');
    await rejects(service.createEvent(actors.admin, { label: 'Liga', judges: ['nao-existe'] }), 'invalid_input');
    expect(await events.latest()).toBeNull();
  });

  it('ADM troca a escala; repetidos viram um', async () => {
    const { service, accounts } = setup();
    const juiz = await member(accounts, 'juiz', true);
    const { event } = await service.createEvent(actors.admin, { label: 'Liga' });
    expect((await service.setJudges(actors.admin, event.id, [juiz, juiz])).judges).toEqual([juiz]);
    expect((await service.update(actors.admin, event.id, { judges: [] })).judges).toEqual([]);
    await rejects(service.setJudges(actors.admin, 'nao-existe', []), 'event_not_found');
  });

  it('só o ADM escala', async () => {
    const { service } = setup();
    const { event } = await service.createEvent(actors.admin, { label: 'Liga' });
    await rejects(service.setJudges(actors.p1, event.id, []), 'forbidden');
    await rejects(service.setJudges(null, event.id, []), 'forbidden');
  });
});

describe('envio pelo navegador do ADM', () => {
  it('ADM envia para o evento ativo e amarra o torneio', async () => {
    const { service } = setup();
    const { event } = await service.createEvent(actors.admin, { label: 'Liga' });
    expect(await service.authorizeAdminUpload(actors.admin, 'FODASE')).toMatchObject({ id: event.id, tournament: 'FODASE' });
    expect((await service.authorizeAdminUpload(actors.admin, 'FODASE'))?.tournament).toBe('FODASE');
  });

  it('sem evento ativo: recusa com a mensagem', async () => {
    const { service } = setup();
    await rejects(service.authorizeAdminUpload(actors.admin, 'FODASE'), 'event_state', 'Crie o evento para começar a enviar');
    const { event } = await service.createEvent(actors.admin, { label: 'Liga' });
    await service.cancel(actors.admin, event.id);
    await rejects(service.authorizeAdminUpload(actors.admin, 'FODASE'), 'event_state', 'Crie o evento para começar a enviar');
  });

  it('torneio diferente do amarrado: mensagem com os dois nomes', async () => {
    const { service } = setup();
    await service.createEvent(actors.admin, { label: 'Liga' });
    await service.authorizeAdminUpload(actors.admin, 'FODASE');
    await rejects(service.authorizeAdminUpload(actors.admin, 'TESTE'), 'tournament_mismatch',
      'A pasta está com o torneio TESTE, mas este evento é do torneio FODASE. Abra o torneio FODASE no TOM.');
  });

  it('arquivo de antes do evento (torneio antigo na pasta) é ignorado e não amarra o torneio', async () => {
    const { service } = setup();
    const { event } = await service.createEvent(actors.admin, { label: 'Liga' });
    const before = new Date(event.createdAt.getTime() - 60_000);
    expect(await service.authorizeAdminUpload(actors.admin, 'ANTIGO', before)).toBeNull();
    const after = new Date(event.createdAt.getTime() + 60_000);
    expect(await service.authorizeAdminUpload(actors.admin, 'NOVO', after)).toMatchObject({ tournament: 'NOVO' });
    // Já amarrado: arquivo antigo do mesmo torneio (ex.: o roster gravado antes do evento) segue normal.
    expect(await service.authorizeAdminUpload(actors.admin, 'NOVO', before)).toMatchObject({ tournament: 'NOVO' });
  });

  it('jogador e juiz não enviam', async () => {
    const { service } = setup();
    await service.createEvent(actors.admin, { label: 'Liga' });
    await rejects(service.authorizeAdminUpload(actors.p1, 'FODASE'), 'forbidden');
    await rejects(service.authorizeAdminUpload(actors.judge, 'FODASE'), 'forbidden');
    await rejects(service.authorizeAdminUpload(null, 'FODASE'), 'forbidden');
  });
});
