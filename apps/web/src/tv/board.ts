import type { BoardResponse } from '@tom/contracts';

export type Clock =
  | { state: 'waiting' }
  | { state: 'running'; text: string; warning: boolean }
  | { state: 'over' };

const WARNING_MS = 5 * 60_000;

/**
 * Cronômetro da rodada. `skewMs` = relógio do servidor − relógio local, medido na última resposta:
 * a TV pode estar com a hora errada, o servidor não.
 */
export const roundClock = (board: Pick<BoardResponse, 'endsAt'>, nowMs: number, skewMs: number): Clock => {
  if (!board.endsAt) return { state: 'waiting' };
  const left = Date.parse(board.endsAt) - (nowMs + skewMs);
  if (left <= 0) return { state: 'over' };
  const seconds = Math.ceil(left / 1000);
  const text = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  return { state: 'running', text, warning: left <= WARNING_MS };
};

/** TV não rola: as mesas são divididas em páginas que trocam sozinhas. */
export const pages = <T>(items: readonly T[], perPage: number): T[][] => {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += perPage) result.push(items.slice(i, i + perPage));
  return result.length ? result : [[]];
};
