/** Classes repetidas das telas (Tailwind). As compactas são do notebook; as grandes, do celular (alvo de toque). */
export const field = 'w-full rounded-md border border-line bg-bg px-3 py-2 text-sm text-text';
export const primary = 'rounded-md bg-accent px-4 py-2 text-sm font-bold text-accent-text disabled:opacity-60';
export const ghost = 'rounded-md border border-line bg-panel px-3 py-2 text-sm font-semibold text-text hover:border-accent disabled:opacity-60';
export const linkButton = 'cursor-pointer bg-transparent p-0 text-sm font-medium text-accent hover:underline disabled:opacity-60';
export const box = 'flex min-h-0 flex-col gap-3 rounded-lg border border-line bg-panel p-4';

/** Celular: uma coluna, o que importa primeiro. */
export const page = 'mx-auto flex w-full max-w-md flex-col gap-4 px-4 pb-10 pt-3';
export const card = 'flex flex-col gap-3 rounded-2xl border border-line bg-panel p-5';
export const cardWarn = `${card} border-warn`;
export const title = 'm-0 text-xl font-bold';
export const subtitle = 'm-0 text-lg font-bold';
export const muted = 'm-0 text-sm text-muted';
export const input = 'w-full rounded-lg border border-line bg-bg px-3 py-3 text-base text-text focus:outline-2 focus:outline-accent';
export const label = 'flex flex-col gap-1 text-sm text-muted';
export const bigPrimary = 'w-full rounded-lg bg-accent px-4 py-3 text-base font-bold text-accent-text no-underline text-center disabled:opacity-60';
export const bigGhost = 'w-full rounded-lg border border-line bg-panel px-4 py-3 text-base font-semibold text-text disabled:opacity-60';
export const textButton = 'cursor-pointer self-center bg-transparent p-1 text-sm font-medium text-accent hover:underline disabled:opacity-60';

export type Tone = 'ok' | 'error' | 'warn' | 'muted';
export const TONE: Record<Tone, string> = { ok: 'text-ok', error: 'text-error', warn: 'text-warn', muted: 'text-muted' };

/** Resultado de uma ação: só "ok" quando a API confirmou; erro como alerta. */
export const Feedback = ({ message }: { message: { ok: boolean; text: string } | null }) =>
  message ? <p class={`m-0 text-sm font-medium ${message.ok ? 'text-ok' : 'text-error'}`} role={message.ok ? 'status' : 'alert'}>{message.text}</p> : null;

/** Resultado da API: erro vira exceção com a mensagem dela. */
export const ok = <T,>(result: { ok: true; body: T } | { ok: false; error: { message: string } }): T => {
  if (!result.ok) throw new Error(result.error.message);
  return result.body;
};
