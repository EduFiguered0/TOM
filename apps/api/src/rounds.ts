import type { MyRoundResponse, SeatDto } from '@tom/contracts';
import { streamKey, type Actor, type RoundRef, type RoundService, type RoundState } from '@tom/core';

/** Celulares consultam a cada 10 s: o estado da rodada é lido uma vez a cada 3 s por instância da Lambda. */
const CACHE_MS = 3000;

/**
 * Estado da rodada com cache curto. Comandos (reporte, início) gravam pelo RoundService e
 * atualizam o cache com o estado que ele devolve, então quem reportou vê o próprio reporte na hora.
 */
export const createRoundReader = (rounds: RoundService, now: () => number = Date.now) => {
  const cache = new Map<string, { state: RoundState; at: number }>();
  return {
    async state(ref: RoundRef): Promise<RoundState> {
      const hit = cache.get(streamKey(ref));
      if (hit && now() - hit.at < CACHE_MS) return hit.state;
      const state = await rounds.state(ref);
      cache.set(streamKey(ref), { state, at: now() });
      return state;
    },
    remember(state: RoundState): RoundState {
      cache.set(streamKey(state.ref), { state, at: now() });
      return state;
    },
  };
};

export type RoundReader = ReturnType<typeof createRoundReader>;

const seatOf = (state: RoundState, actor: Actor | null): SeatDto => {
  if (!actor) return { kind: 'not_checked_in' };
  if (actor.role !== 'player') return { kind: 'not_paired' };
  const table = state.tables.find((t) => t.player1.playerId === actor.playerId || t.player2.playerId === actor.playerId);
  if (!table) return { kind: 'not_paired' };
  const side = table.player1.playerId === actor.playerId ? 'player1' : 'player2';
  const other = side === 'player1' ? 'player2' : 'player1';
  return {
    kind: 'table',
    table: table.table,
    opponent: table[other].name,
    deadline: table.deadline?.toISOString() ?? null,
    color: table.status.color,
    redReason: table.status.color === 'red' ? table.status.reason : null,
    myReport: table.reports[side] ?? null,
    opponentReported: table.reports[other] !== undefined,
    locked: table.keyLaunched || table.status.color === 'green',
  };
};

/** Rodada do ponto de vista de quem chama: a própria mesa, sem o placar do oponente. */
export const myRound = (state: RoundState | null, actor: Actor | null, serverTime: Date): MyRoundResponse => ({
  round: state?.pairing
    ? {
        tournament: state.ref.tournament,
        division: state.ref.division,
        round: state.ref.round,
        bestOf: state.bestOf,
        startedAt: state.startedAt?.toISOString() ?? null,
        seat: seatOf(state, actor),
      }
    : null,
  serverTime: serverTime.toISOString(),
});
