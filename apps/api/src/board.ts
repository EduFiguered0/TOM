import type { BoardResponse } from '@tom/contracts';
import { DEFAULT_ROUND_MINUTES, type EventRegistry, type RoundRef, type RoundState } from '@tom/core';

export interface BoardDeps {
  registry: EventRegistry;
  rounds: { state(ref: RoundRef): Promise<RoundState> };
  clock: { now(): Date };
}

/** Rodada atual para a TV: pública, só nomes. null enquanto o enviador não publicou nenhuma rodada. */
export const createBoard = ({ registry, rounds, clock }: BoardDeps) => async (): Promise<BoardResponse | null> => {
  const current = await registry.current();
  if (!current) return null;
  const state = await rounds.state(current.ref);
  const minutes = state.roundMinutes ?? DEFAULT_ROUND_MINUTES;
  return {
    tournament: current.ref.tournament,
    division: current.ref.division,
    round: current.ref.round,
    startedAt: state.startedAt?.toISOString() ?? null,
    endsAt: state.startedAt ? new Date(state.startedAt.getTime() + minutes * 60_000).toISOString() : null,
    tables: state.tables.map((t) => ({ table: t.table, player1: t.player1.name, player2: t.player2.name, color: t.status.color })),
    byes: state.byes,
    serverTime: clock.now().toISOString(),
  };
};
