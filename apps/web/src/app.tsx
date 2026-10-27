import { useCallback, useEffect, useState } from 'preact/hooks';
import { OfflineError, type Api } from './api.js';
import type { Cognito } from './auth/cognito.js';
import type { Google } from './auth/google.js';
import type { Session } from './auth/session.js';
import { screenFor, type Screen } from './flow.js';
import { Device } from './screens/device.js';
import { Home } from './screens/home.js';
import { Login } from './screens/login.js';
import { Register } from './screens/register.js';
import { AdminShell } from './admin/admin-shell.js';
import type { PendingJoin } from './pending-join.js';
import { STORE } from './public/store.js';
import { bigPrimary, card, muted, page } from './ui.js';

interface Props {
  cognito: Cognito;
  session: Session;
  api: Api;
  /** null quando o Google ainda não está ligado. */
  google: Google | null;
  /** Falha ao voltar do Google, mostrada na tela de login. */
  loginError: string | null;
  /** Código do QR escaneado antes do login: inscreve ao chegar na conta. */
  pendingJoin: PendingJoin;
  /** Convite de juiz escaneado (`/juiz/<código>`): aceito no fim do login/cadastro. */
  pendingInvite: PendingJoin;
}

export const App = ({ cognito, session, api, google, loginError, pendingJoin, pendingInvite }: Props) => {
  const [screen, setScreen] = useState<Screen>({ name: 'loading' });
  const [joinError, setJoinError] = useState<string | null>(null);
  const [eventRefresh, setEventRefresh] = useState(0);
  const [inviteNotice, setInviteNotice] = useState<{ ok: boolean; text: string } | null>(null);

  // Fim do caminho do QR: logado e com cadastro completo (com Player ID), a inscrição acontece sozinha.
  useEffect(() => {
    if (screen.name !== 'home') return;
    const code = pendingJoin.takeIfReady(screen.me);
    if (!code) return;
    void api.joinEvent(code)
      .then((result) => { setJoinError(result.ok ? null : result.error.message); setEventRefresh((n) => n + 1); })
      .catch((e: unknown) => { setJoinError((e as Error).message); });
  }, [screen, api, pendingJoin]);

  // Fim do caminho do convite de juiz: com Player ID e nome conferido, aceita sozinho.
  useEffect(() => {
    if (screen.name !== 'home') return;
    const code = pendingInvite.takeIfReady(screen.me);
    if (!code) return;
    void api.acceptInvite(code)
      .then((result) => {
        if (result.ok) { setInviteNotice({ ok: true, text: 'Você agora é juiz da equipe.' }); setScreen({ name: 'home', me: result.body }); }
        else setInviteNotice({ ok: false, text: result.error.message });
      })
      .catch((e: unknown) => { setInviteNotice({ ok: false, text: (e as Error).message }); });
  }, [screen, api, pendingInvite]);

  /** Consulta a própria conta e decide a tela; também detecta quando outro dispositivo assumiu. */
  const check = useCallback(async () => {
    if (!session.loggedIn) { setScreen({ name: 'login' }); return; }
    try {
      const next = screenFor(await api.me());
      if (next.name === 'login' && next.signOut) await session.signOut();
      setScreen(next);
    } catch (e) {
      setScreen({ name: 'error', message: e instanceof OfflineError ? e.message : 'Erro inesperado.' });
    }
  }, [api, session]);

  useEffect(() => {
    void check();
    const onVisible = () => { if (document.visibilityState === 'visible') void check(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { document.removeEventListener('visibilitychange', onVisible); };
  }, [check]);

  const signOut = () => { void session.signOut().then(() => { setScreen({ name: 'login' }); }); };

  // ADM e juiz escalado no notebook: casca própria, sem a coluna estreita do celular.
  if (screen.name === 'home' && (screen.me.role === 'admin' || screen.me.judging)) return <AdminShell api={api} me={screen.me} onSignOut={signOut} />;

  return (
    <main class={page}>
      <header><a class="font-bold text-text no-underline" href="/">{STORE.name}</a></header>
      {screen.name === 'loading' && <p class={`${muted} text-center`}>Carregando…</p>}
      {screen.name === 'login' && (
        <Login cognito={cognito} google={google} initialError={screen.message ?? loginError} onSignedIn={(tokens) => { session.signedIn(tokens); void check(); }} />
      )}
      {screen.name === 'register' && <Register api={api} onRegistered={(me) => { setScreen({ name: 'home', me }); }} />}
      {screen.name === 'device' && <Device api={api} onActivated={(me) => { setScreen({ name: 'home', me }); }} onCancel={signOut} />}
      {screen.name === 'home' && (
        <Home me={screen.me} api={api} onSignOut={signOut} onChanged={(me) => { setScreen({ name: 'home', me }); }} joinError={joinError} eventRefresh={eventRefresh} notice={inviteNotice} />
      )}
      {screen.name === 'error' && (
        <section class={card}>
          <p class="m-0 font-medium text-error" role="alert">{screen.message}</p>
          <button type="button" class={bigPrimary} onClick={() => { void check(); }}>Tentar de novo</button>
        </section>
      )}
    </main>
  );
};
