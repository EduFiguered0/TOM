import type { RoundBoard } from '@tom/contracts';

export type Clock =
  | { state: 'waiting' }
  | { state: 'running'; text: string; warning: boolean }
  | { state: 'over' };

const WARNING_MS = 5 * 60_000;

/**
 * Cronômetro da rodada. `skewMs` = relógio do servidor − relógio local, medido na última resposta:
 * a TV pode estar com a hora errada, o servidor não.
 */
export const roundClock = (board: Pick<RoundBoard, 'endsAt'>, nowMs: number, skewMs: number): Clock => {
  if (!board.endsAt) return { state: 'waiting' };
  const left = Date.parse(board.endsAt) - (nowMs + skewMs);
  if (left <= 0) return { state: 'over' };
  return { state: 'running', text: mmss(left), warning: left <= WARNING_MS };
};

const mmss = (ms: number) => {
  const seconds = Math.ceil(ms / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
};

export type Extension = { kind: 'none' } | { kind: 'minutes'; text: string } | { kind: 'turns'; turns: number };

type ExtensionTable = Pick<RoundBoard['tables'][number], 'color' | 'deadline' | 'extraTurns'>;

/**
 * Acréscimo da rodada depois do tempo: contagem até o prazo mais distante entre as mesas sem resultado, ou os turnos
 * extras. Mesas verdes não contam; sem mesa pendente, a TV volta a "Tempo esgotado".
 */
export const extensionClock = (
  board: { extension: RoundBoard['extension']; tables: readonly ExtensionTable[] }, nowMs: number, skewMs: number,
): Extension => {
  if (!board.extension) return { kind: 'none' };
  const pending = board.tables.filter((t) => t.color !== 'green');
  const now = nowMs + skewMs;
  const last = Math.max(...pending.flatMap((t) => (t.deadline ? [Date.parse(t.deadline)] : [])), -Infinity);
  if (last > now) return { kind: 'minutes', text: mmss(last - now) };
  const turns = pending.find((t) => t.extraTurns !== null)?.extraTurns;
  return turns ? { kind: 'turns', turns } : { kind: 'none' };
};

const PER_COLUMN = 15;
const MAX_COLUMNS = 3;

/**
 * Mesas numa página só: até 15 por coluna e até 3 colunas. Acima de 45, páginas do mesmo tamanho (46 → 23 + 23)
 * que trocam sozinhas.
 */
export const tvColumns = (count: number): { columns: 1 | 2 | 3; perColumn: number; pages: number; perPage: number } => {
  const pages = Math.max(1, Math.ceil(count / (PER_COLUMN * MAX_COLUMNS)));
  const perPage = Math.ceil(count / pages);
  const columns = Math.min(MAX_COLUMNS, Math.max(1, Math.ceil(perPage / PER_COLUMN))) as 1 | 2 | 3;
  return { columns, perColumn: PER_COLUMN, pages, perPage };
};

/**
 * Diferença entre o relógio do servidor e o da TV, medida uma vez na chegada da resposta. Recalcular a cada segundo
 * congelava o cronômetro até a resposta seguinte (os segundos "atrasavam" e pulavam).
 */
export const clockSkew = (serverTime: string, receivedAtMs: number): number => Date.parse(serverTime) - receivedAtMs;

/** TV não rola: as mesas são divididas em páginas que trocam sozinhas. */
export const pages = <T>(items: readonly T[], perPage: number): T[][] => {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += perPage) result.push(items.slice(i, i + perPage));
  return result.length ? result : [[]];
};

/** Caminho SVG do QR: um quadrado por módulo escuro. Montado no JSX, sem innerHTML. */
export const qrPath = (data: readonly (readonly boolean[])[]): string =>
  data.flatMap((row, y) => row.flatMap((dark, x) => (dark ? [`M${String(x)} ${String(y)}h1v1h-1z`] : []))).join('');

/** Endereço que o QR abre: a inscrição no evento. */
export const joinUrl = (origin: string, code: string): string => `${origin}/e/${code}`;
