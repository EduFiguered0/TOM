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
import { PanelScreen } from './panel/panel-screen.js';
import type { PendingJoin } from './pending-join.js';
import { STORE } from './public/store.js';

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
}

export const App = ({ cognito, session, api, google, loginError, pendingJoin }: Props) => {
  const [screen, setScreen] = useState<Screen>({ name: 'loading' });
  const [joinError, setJoinError] = useState<string | null>(null);
  const [eventRefresh, setEventRefresh] = useState(0);

  // Fim do caminho do QR: logado e com cadastro completo (com Player ID), a inscrição acontece sozinha.
  useEffect(() => {
    if (screen.name !== 'home') return;
    const code = pendingJoin.takeIfReady(screen.me);
    if (!code) return;
    void api.joinEvent(code)
      .then((result) => { setJoinError(result.ok ? null : result.error.message); setEventRefresh((n) => n + 1); })
      .catch((e: unknown) => { setJoinError((e as Error).message); });
  }, [screen, api, pendingJoin]);

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

  return (
    <main>
      <header><a class="brand" href="/">{STORE.name}</a></header>
      {screen.name === 'loading' && <p class="muted center">Carregando…</p>}
      {screen.name === 'login' && (
        <Login cognito={cognito} google={google} initialError={screen.message ?? loginError} onSignedIn={(tokens) => { session.signedIn(tokens); void check(); }} />
      )}
      {screen.name === 'register' && <Register api={api} onRegistered={(me) => { setScreen({ name: 'home', me }); }} />}
      {screen.name === 'device' && <Device api={api} onActivated={(me) => { setScreen({ name: 'home', me }); }} onCancel={signOut} />}
      {screen.name === 'home' && (location.pathname.startsWith('/painel') && (screen.me.role === 'admin' || screen.me.judging)
        ? <PanelScreen api={api} me={screen.me} />
        : <Home me={screen.me} api={api} onSignOut={signOut} onChanged={(me) => { setScreen({ name: 'home', me }); }} joinError={joinError} eventRefresh={eventRefresh} />)}
      {screen.name === 'error' && (
        <section class="card">
          <p class="error" role="alert">{screen.message}</p>
          <button type="button" onClick={() => { void check(); }}>Tentar de novo</button>
        </section>
      )}
    </main>
  );
};
