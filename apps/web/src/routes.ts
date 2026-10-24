export type Page = 'tv' | 'home' | 'privacy' | 'account';

/** Vitrine pública (`/`, `/privacidade`), TV do salão e área logada (`/conta`, `/painel`). */
export const pageFor = (pathname: string): Page => {
  if (pathname.startsWith('/tv')) return 'tv';
  if (pathname === '/privacidade') return 'privacy';
  if (pathname.startsWith('/conta') || pathname.startsWith('/painel')) return 'account';
  return 'home';
};
