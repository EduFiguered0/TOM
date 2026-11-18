export type Step = 'browse' | 'login' | 'loading' | 'profile' | 'redirecting';

/** Depois do clique em comprar: login, cadastro ou compra. A API confere tudo de novo antes de liberar o link. */
export const nextStep = ({ loggedIn, me, wantsEvent }: { loggedIn: boolean; me: { missing: readonly string[] } | null; wantsEvent: string | null }): Step => {
  if (!wantsEvent) return 'browse';
  if (!loggedIn) return 'login';
  if (!me) return 'loading';
  return me.missing.length > 0 ? 'profile' : 'redirecting';
};
