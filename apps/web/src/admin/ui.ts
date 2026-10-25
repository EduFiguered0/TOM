/** Classes repetidas da área do ADM (Tailwind). */
export const field = 'w-full rounded-md border border-line bg-bg px-3 py-2 text-sm text-text';
export const primary = 'rounded-md bg-accent px-4 py-2 text-sm font-bold text-accent-text disabled:opacity-60';
export const ghost = 'rounded-md border border-line bg-panel px-3 py-2 text-sm font-semibold text-text hover:border-accent disabled:opacity-60';
export const linkButton = 'cursor-pointer bg-transparent p-0 text-sm font-medium text-accent hover:underline disabled:opacity-60';
export const box = 'flex min-h-0 flex-col gap-3 rounded-lg border border-line bg-panel p-4';

/** Resultado da API: erro vira exceção com a mensagem dela. */
export const ok = <T,>(result: { ok: true; body: T } | { ok: false; error: { message: string } }): T => {
  if (!result.ok) throw new Error(result.error.message);
  return result.body;
};
