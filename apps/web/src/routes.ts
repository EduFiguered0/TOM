import { joinCodeOf } from './pending-join.js';

export type Page = 'tv' | 'home' | 'privacy' | 'account' | 'join';

/** Vitrine pública (`/`, `/privacidade`), TV do salão, QR do evento (`/e/<código>`) e área logada (`/conta`, `/painel`). */
export const pageFor = (pathname: string): Page => {
  if (pathname.startsWith('/tv')) return 'tv';
  if (pathname === '/privacidade') return 'privacy';
  if (joinCodeOf(pathname)) return 'join';
  if (pathname.startsWith('/conta') || pathname.startsWith('/painel')) return 'account';
  return 'home';
};
