import type { BoardResponse, RoundBoard } from '@tom/contracts';
import { DEFAULT_ROUND_MINUTES, type CurrentRound, type EventRegistry, type RegistrationRepository, type RoundRef, type RoundState } from '@tom/core';

export interface BoardDeps {
  registry: EventRegistry;
  rounds: { state(ref: RoundRef): Promise<RoundState> };
  registrations: RegistrationRepository;
  clock: { now(): Date };
}

/**
 * Quadro público da TV, por fase do último evento: espera, QR com inscritos, confirmação de presença,
 * pareamentos da rodada ou classificação final (até o próximo evento ser criado). Só nomes, nunca Player ID.
 */
export const createBoard = ({ registry, rounds, registrations, clock }: BoardDeps) => async (): Promise<BoardResponse> => {
  const serverTime = clock.now().toISOString();
  const latest = await registry.latest();
  const event = latest?.event;
  if (!event) return { state: 'idle', serverTime };
  const summary = { label: event.label, date: event.date };
  const kept = async () => (await registrations.list(event.id)).filter((r) => !r.removed);
  switch (event.status) {
    case 'open':
      return { state: 'open', event: summary, code: event.code ?? '', registered: (await kept()).length, serverTime };
    case 'confirming': {
      const list = await kept();
      return { state: 'confirming', event: summary, registered: list.length, confirmed: list.filter((r) => r.confirmed).length, serverTime };
    }
    case 'running': {
      const current = await registry.current();
      return current?.eventId === event.id ? { state: 'running', ...(await round(current, rounds, serverTime)) } : { state: 'idle', serverTime };
    }
    case 'final':
    case 'closed':
      return event.standings ? { state: 'final', event: summary, standings: event.standings, serverTime } : { state: 'idle', serverTime };
    case 'cancelled':
      return { state: 'idle', serverTime };
  }
};

const round = async (current: CurrentRound, rounds: BoardDeps['rounds'], serverTime: string): Promise<RoundBoard> => {
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
    serverTime,
  };
};
