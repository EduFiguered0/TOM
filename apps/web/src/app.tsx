import { useCallback, useEffect, useState } from 'preact/hooks';
import { OfflineError, type Api } from './api.js';
import type { Cognito } from './auth/cognito.js';
import type { Session } from './auth/session.js';
import { screenFor, type Screen } from './flow.js';
import { Device } from './screens/device.js';
import { Home } from './screens/home.js';
import { Login } from './screens/login.js';
import { Register } from './screens/register.js';

interface Props {
  cognito: Cognito;
  session: Session;
  api: Api;
}

export const App = ({ cognito, session, api }: Props) => {
  const [screen, setScreen] = useState<Screen>({ name: 'loading' });

  /** Consulta a própria conta e decide a tela; também detecta quando outro dispositivo assumiu. */
  const check = useCallback(async () => {
    if (!session.loggedIn) { setScreen({ name: 'login' }); return; }
    try {
      setScreen(screenFor(await api.me()));
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
      <header><span class="brand">Torneios TOM</span></header>
      {screen.name === 'loading' && <p class="muted center">Carregando…</p>}
      {screen.name === 'login' && <Login cognito={cognito} onSignedIn={(tokens) => { session.signedIn(tokens); void check(); }} />}
      {screen.name === 'register' && <Register api={api} onRegistered={(me) => { setScreen({ name: 'home', me }); }} />}
      {screen.name === 'device' && <Device api={api} onActivated={(me) => { setScreen({ name: 'home', me }); }} onCancel={signOut} />}
      {screen.name === 'home' && <Home me={screen.me} api={api} onSignOut={signOut} />}
      {screen.name === 'error' && (
        <section class="card">
          <p class="error" role="alert">{screen.message}</p>
          <button type="button" onClick={() => { void check(); }}>Tentar de novo</button>
        </section>
      )}
    </main>
  );
};
