import type { BoardResponse, RoundBoard } from '@tom/contracts';
import { DEFAULT_ROUND_MINUTES, tvResult, type CurrentRound, type EventRegistry, type RegistrationRepository, type RoundRef, type RoundState } from '@tom/core';

export interface BoardDeps {
  registry: EventRegistry;
  rounds: { state(ref: RoundRef): Promise<RoundState> };
  registrations: RegistrationRepository;
  clock: { now(): Date };
}

/**
 * Quadro público da TV, por fase do último evento: espera, QR com inscritos, pareamentos da rodada (com o QR
 * para quem chega tarde) ou classificação final (até o próximo evento ser criado). Só nomes, nunca Player ID.
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
    case 'running': {
      const current = await registry.current();
      if (current?.eventId !== event.id) return { state: 'idle', serverTime };
      // Standings da rodada atual (ou posterior) chegou: classificação parcial até o pareamento seguinte.
      if (event.partial && event.partial.round >= current.ref.round) {
        return { state: 'standings', event: summary, round: event.partial.round, standings: event.partial.standings, serverTime };
      }
      return { state: 'running', ...(await round(current, rounds, serverTime)), code: event.code ?? '' };
    }
    case 'final':
      return event.standings ? { state: 'final', event: summary, standings: event.standings, serverTime } : { state: 'idle', serverTime };
    case 'closed':
      // Encerrar limpa a TV; a classificação só volta se o ADM reexibir.
      return event.onTv && event.standings ? { state: 'final', event: summary, standings: event.standings, serverTime } : { state: 'idle', serverTime };
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
    tables: state.tables.map((t) => ({
      table: t.table, player1: t.player1.name, player2: t.player2.name, color: t.status.color, result: tvResult(t.status),
    })),
    byes: state.byes,
    serverTime,
  };
};
