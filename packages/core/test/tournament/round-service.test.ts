import { describe, expect, it } from 'vitest';
import {
  CommandRejected,
  ConcurrencyError,
  InMemoryEventStore,
  RoundService,
  type RejectCode,
  type Report,
} from '../../src/index.js';
import { TestClock, actors, pairing, ref, setup, startedRound } from './support.js';

const score = (own: number, opponent: number): Report => ({ kind: 'score', own, opponent });

const rejects = async (promise: Promise<unknown>, code: RejectCode) => {
  await expect(promise).rejects.toThrow(CommandRejected);
  await promise.catch((e: unknown) => {
    expect((e as CommandRejected).code).toBe(code);
  });
};

describe('pareamento e início da rodada', () => {
  it('mesas sempre em ordem crescente, mesmo com o pareamento fora de ordem', async () => {
    const { service } = setup();
    const p = pairing();
    const state = await service.publishPairing(actors.uploader, { ...p, tables: [...p.tables].reverse() });
    expect(state.tables.map((t) => t.table)).toEqual([1, 2]);
  });

  it('pareamento publicado: mesas cinza, bye à parte, rodada sem prazo', async () => {
    const { service } = setup();
    const state = await service.publishPairing(actors.uploader, pairing());
    expect(state.tables.map((t) => [t.table, t.status.color, t.deadline])).toEqual([[1, 'gray', null], [2, 'gray', null]]);
    expect(state.byes).toEqual(['teste1 1']);
    expect(state.startedAt).toBeNull();
  });

  it('só o ADM inicia; prazo de 50 min a partir do clique', async () => {
    const { service } = setup();
    await service.publishPairing(actors.uploader, pairing());
    await rejects(service.startRound(actors.judge, ref, { bestOf: 3 }), 'forbidden');
    const state = await service.startRound(actors.admin, ref, { bestOf: 3 });
    expect(state.tables[0]?.deadline).toEqual(new Date('2026-10-23T14:50:00Z'));
  });

  it('não inicia sem pareamento, nem duas vezes, nem com tempo inválido', async () => {
    const { service } = setup();
    await rejects(service.startRound(actors.admin, ref, { bestOf: 3 }), 'round_not_paired');
    await service.publishPairing(actors.uploader, pairing());
    await rejects(service.startRound(actors.admin, ref, { bestOf: 3, roundMinutes: 0 }), 'invalid_input');
    await service.startRound(actors.admin, ref, { bestOf: 3 });
    await rejects(service.startRound(actors.admin, ref, { bestOf: 3 }), 'round_already_started');
  });

  it('pareamento republicado antes do início substitui; depois do início é recusado', async () => {
    const { service } = setup();
    await service.publishPairing(actors.uploader, pairing());
    const repaired = { ...pairing(), tables: pairing().tables.slice(0, 1) };
    expect((await service.publishPairing(actors.uploader, repaired)).tables).toHaveLength(1);
    await service.startRound(actors.admin, ref, { bestOf: 3 });
    await rejects(service.publishPairing(actors.uploader, pairing()), 'round_already_started');
  });

  it('próxima rodada começa mesmo com keys da anterior pendentes (o painel avisa)', async () => {
    const { service } = await startedRound();
    const next = { ...ref, round: 4 };
    await service.publishPairing(actors.uploader, pairing(next));
    expect((await service.startRound(actors.admin, next, { bestOf: 3 })).startedAt).not.toBeNull();
  });

  it('rodada anterior que nunca foi iniciada no site não segura a próxima (o TOM seguiu sem o site)', async () => {
    const { service } = setup();
    await service.publishPairing(actors.uploader, pairing());
    const next = { ...ref, round: 4 };
    await service.publishPairing(actors.uploader, pairing(next));
    expect((await service.startRound(actors.admin, next, { bestOf: 3 })).startedAt).not.toBeNull();
  });
});

describe('reportes', () => {
  it('jogadores reportam a própria mesa: laranja, depois verde', async () => {
    const { service } = await startedRound();
    expect((await service.submitReport(actors.p1, ref, { table: 1, report: score(2, 1) })).tables[0]?.status).toEqual({
      color: 'orange', reportedBy: 'player1',
    });
    const state = await service.submitReport(actors.p2, ref, { table: 1, report: score(1, 2) });
    expect(state.tables[0]?.status).toMatchObject({ color: 'green', result: { player1: 2, player2: 1 } });
  });

  it('jogador reporta uma vez só; divergência é com o juiz; o ADM ainda corrige o lado', async () => {
    const { service } = await startedRound();
    await service.submitReport(actors.p1, ref, { table: 1, report: score(2, 0) });
    await service.submitReport(actors.p2, ref, { table: 1, report: score(1, 2) });
    expect((await service.state(ref)).tables[0]?.status).toEqual({ color: 'red', reason: 'score_mismatch' });
    const again = service.submitReport(actors.p1, ref, { table: 1, report: score(2, 1) });
    await rejects(again, 'table_locked');
    await expect(again).rejects.toThrow('Você já reportou esta mesa. Para corrigir, chame o juiz.');
    const state = await service.submitReport(actors.admin, ref, { table: 1, report: score(2, 1), side: 'player1' });
    expect(state.tables[0]?.status.color).toBe('green');
  });

  it('verde trava o jogador', async () => {
    const { service } = await startedRound();
    await service.submitReport(actors.p1, ref, { table: 1, report: score(2, 1) });
    await service.submitReport(actors.p2, ref, { table: 1, report: score(1, 2) });
    await rejects(service.submitReport(actors.p1, ref, { table: 1, report: score(2, 0) }), 'table_locked');
  });

  it('recusa jogador de outra mesa, mesa inexistente, placar inválido e rodada não iniciada', async () => {
    const { service } = await startedRound();
    await rejects(service.submitReport(actors.outsider, ref, { table: 1, report: score(2, 0) }), 'not_your_table');
    await rejects(service.submitReport(actors.p1, ref, { table: 9, report: score(2, 0) }), 'table_not_found');
    await rejects(service.submitReport(actors.p1, ref, { table: 1, report: score(2, 2) }), 'invalid_input');
    await rejects(service.submitReport(actors.judge, ref, { table: 1, report: score(2, 0) }), 'forbidden');

    const fresh = setup();
    await fresh.service.publishPairing(actors.uploader, pairing());
    await rejects(fresh.service.submitReport(actors.p1, ref, { table: 1, report: score(2, 0) }), 'round_not_started');
  });

  it('ADM reporta por jogador sem celular informando o lado', async () => {
    const { service } = await startedRound();
    await rejects(service.submitReport(actors.admin, ref, { table: 2, report: score(2, 0) }), 'side_required');
    const state = await service.submitReport(actors.admin, ref, { table: 2, report: score(2, 0), side: 'player2' });
    expect(state.tables[1]?.reports).toEqual({ player2: score(2, 0) });
  });

  it('o reporte grava conta, papel e horário', async () => {
    const { service, store } = await startedRound();
    await service.submitReport(actors.p1, ref, { table: 1, report: score(2, 1) });
    const last = (await store.read(ref)).events.at(-1);
    expect(last).toMatchObject({
      type: 'report_submitted', table: 1, side: 'player1', actor: actors.p1, ref, at: new Date('2026-10-23T14:00:00Z'),
    });
  });
});

describe('tempo, override e key', () => {
  it('fim do tempo deixa vermelho; acréscimo dá prazo próprio à mesa', async () => {
    const { service, clock } = await startedRound();
    await service.extendTime(actors.judge, ref, { table: 2, minutes: 5 });
    clock.advance(51);
    const state = await service.state(ref);
    expect(state.tables.map((t) => t.status.color)).toEqual(['red', 'gray']);
    clock.advance(5);
    expect((await service.state(ref)).tables[1]?.status).toEqual({ color: 'red', reason: 'timeout' });
  });

  it('acréscimo só por juiz/ADM e com minutos válidos', async () => {
    const { service } = await startedRound();
    await rejects(service.extendTime(actors.p1, ref, { table: 1, minutes: 5 }), 'forbidden');
    await rejects(service.extendTime(actors.judge, ref, { table: 1, minutes: 0 }), 'invalid_input');
  });

  it('override do juiz deixa verde e grava autor e motivo', async () => {
    const { service } = await startedRound();
    const { state, requiresTomFix } = await service.applyOverride(actors.judge, ref, {
      table: 1, override: { kind: 'double_game_loss' }, reason: '  atraso dos dois  ',
    });
    expect(requiresTomFix).toBe(false);
    expect(state.tables[0]?.status).toMatchObject({ color: 'green', source: 'override' });
    expect(state.tables[0]?.override).toMatchObject({ reason: 'atraso dos dois', by: actors.judge });
  });

  it('override recusa jogador e placar inválido; motivo é opcional', async () => {
    const { service } = await startedRound();
    const input = { table: 1, override: { kind: 'intentional_draw' } as const, reason: 'x' };
    await rejects(service.applyOverride(actors.p1, ref, input), 'forbidden');
    expect((await service.applyOverride(actors.judge, ref, { ...input, reason: '  ' })).state.tables[0]?.override?.reason).toBe('');
    await rejects(
      service.applyOverride(actors.judge, ref, { ...input, override: { kind: 'score', player1: 3, player2: 0 } }),
      'invalid_input',
    );
  });

  it('key: só ADM, só mesa verde, uma vez; trava o jogador; override depois avisa o TOM', async () => {
    const { service } = await startedRound();
    await rejects(service.markKeyLaunched(actors.admin, ref, { table: 1 }), 'not_green');
    await service.submitReport(actors.p1, ref, { table: 1, report: score(2, 1) });
    await service.submitReport(actors.p2, ref, { table: 1, report: score(1, 2) });
    await rejects(service.markKeyLaunched(actors.judge, ref, { table: 1 }), 'forbidden');

    const state = await service.markKeyLaunched(actors.admin, ref, { table: 1 });
    expect(state.tables[0]?.keyLaunched).toBe(true);
    await rejects(service.markKeyLaunched(actors.admin, ref, { table: 1 }), 'key_already_launched');

    const fix = await service.applyOverride(actors.judge, ref, {
      table: 1, override: { kind: 'score', player1: 1, player2: 2 }, reason: 'jogadores erraram',
    });
    expect(fix.requiresTomFix).toBe(true);
  });

  it('round fechado só com todas as keys lançadas', async () => {
    const { service } = await startedRound();
    for (const table of [1, 2]) {
      await service.applyOverride(actors.admin, ref, { table, override: { kind: 'intentional_draw' }, reason: 'ID' });
    }
    const green = await service.state(ref);
    expect([green.allGreen, green.closed]).toEqual([true, false]);
    await service.markKeyLaunched(actors.admin, ref, { table: 1 });
    expect((await service.markKeyLaunched(actors.admin, ref, { table: 2 })).closed).toBe(true);
  });
});

describe('concorrência', () => {
  it('reporte que perde a corrida para o verde é revalidado e recusado', async () => {
    const store = new InMemoryEventStore();
    let raced = false;
    const racingStore = {
      read: store.read.bind(store),
      append: async (...args: Parameters<InMemoryEventStore['append']>) => {
        if (!raced && args[1][0]?.type === 'report_submitted' && args[1][0].side === 'player1') {
          raced = true;
          // outro dispositivo grava os dois reportes coerentes antes deste
          const { version } = await store.read(ref);
          const base = { ref, at: new Date('2026-10-23T14:00:00Z'), type: 'report_submitted', table: 1 } as const;
          await store.append(ref, [
            { ...base, id: 'x1', actor: actors.p1, side: 'player1', report: score(2, 1) },
            { ...base, id: 'x2', actor: actors.p2, side: 'player2', report: score(1, 2) },
          ], version);
        }
        return store.append(...args);
      },
    };
    let n = 0;
    const service = new RoundService({ store: racingStore, clock: new TestClock(), ids: { next: () => `e${String(++n)}` } });
    await service.publishPairing(actors.uploader, pairing());
    await service.startRound(actors.admin, ref, { bestOf: 3 });

    await rejects(service.submitReport(actors.p1, ref, { table: 1, report: score(2, 0) }), 'table_locked');
    expect((await store.read(ref)).events.filter((e) => e.type === 'report_submitted')).toHaveLength(2);
  });

  it('depois de várias corridas seguidas desiste com erro explícito', async () => {
    const store = new InMemoryEventStore();
    const service = new RoundService({
      store: { read: store.read.bind(store), append: () => Promise.reject(new ConcurrencyError('ocupado')) },
      clock: new TestClock(),
      ids: { next: () => 'e' },
    });
    await rejects(service.publishPairing(actors.uploader, pairing()), 'concurrency');
  });
});
