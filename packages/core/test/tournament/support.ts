import {
  InMemoryEventStore,
  RoundService,
  toPlayerId,
  type Actor,
  type Clock,
  type RoundPairing,
  type RoundRef,
} from '../../src/index.js';

export const ref: RoundRef = { tournament: 'FODASE', division: 'Divisão Mestre', round: 3 };

export const pairing = (r: RoundRef = ref): RoundPairing => ({
  ref: r,
  tables: [
    {
      table: 1,
      player1: { playerId: toPlayerId('100001'), name: 'teste2 2' },
      player2: { playerId: toPlayerId('100002'), name: 'teste5 5' },
      keys: { player1Wins: '23119', player2Wins: '23127', tie: '23135' },
    },
    {
      table: 2,
      player1: { playerId: toPlayerId('100005'), name: 'teste3 3' },
      player2: { playerId: toPlayerId('100004'), name: 'teste4 4' },
      keys: { player1Wins: '23218', player2Wins: '23226', tie: '23234' },
    },
  ],
  byes: ['teste1 1'],
});

export const actors = {
  uploader: { role: 'system', source: 'uploader' },
  admin: { role: 'admin', accountId: 'adm' },
  judge: { role: 'judge', accountId: 'juiz' },
  p1: { role: 'player', accountId: 'a1', playerId: toPlayerId('100001') },
  p2: { role: 'player', accountId: 'a2', playerId: toPlayerId('100002') },
  outsider: { role: 'player', accountId: 'a9', playerId: toPlayerId('100005') },
} satisfies Record<string, Actor>;

export class TestClock implements Clock {
  constructor(private current = new Date('2026-10-23T14:00:00Z')) {}

  now(): Date {
    return this.current;
  }

  advance(minutes: number): void {
    this.current = new Date(this.current.getTime() + minutes * 60_000);
  }
}

export const setup = () => {
  const store = new InMemoryEventStore();
  const clock = new TestClock();
  let n = 0;
  const service = new RoundService({ store, clock, ids: { next: () => `e${String(++n)}` } });
  return { store, clock, service };
};

export const startedRound = async () => {
  const ctx = setup();
  await ctx.service.publishPairing(actors.uploader, pairing());
  await ctx.service.startRound(actors.admin, ref, { bestOf: 3 });
  return ctx;
};
