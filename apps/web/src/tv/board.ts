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
  const seconds = Math.ceil(left / 1000);
  const text = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  return { state: 'running', text, warning: left <= WARNING_MS };
};

const PER_COLUMN = 15;
const MAX_COLUMNS = 3;

/** Mesas numa página só: até 15 por coluna e até 3 colunas; acima de 45, páginas de 45 que trocam sozinhas. */
export const tvColumns = (count: number): { columns: 1 | 2 | 3; perColumn: number; pages: number } => {
  const columns = Math.min(MAX_COLUMNS, Math.max(1, Math.ceil(count / PER_COLUMN))) as 1 | 2 | 3;
  return { columns, perColumn: PER_COLUMN, pages: Math.max(1, Math.ceil(count / (PER_COLUMN * MAX_COLUMNS))) };
};

/**
 * O quadro fica até 5 s no cache do CloudFront: o `serverTime` da resposta envelhece. O cabeçalho `Age` diz quanto;
 * sem ele (ou inválido), vale o horário como veio.
 */
export const freshServerTime = (serverTime: string, ageHeader: string | null): string => {
  const age = ageHeader === null ? NaN : Number(ageHeader);
  return Number.isFinite(age) && age > 0 ? new Date(Date.parse(serverTime) + age * 1000).toISOString() : serverTime;
};

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
