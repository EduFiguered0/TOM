import { LEGAL } from '@tom/landing-core';
import { browserStorage, createCognito, createGoogle, createSession } from '@tom/web-auth';
import { render } from 'preact';
import { createLandingApi } from './api.js';
import { App, Footer } from './app.js';
import { createLoginGuard } from './login-guard.js';
import { LegalPage } from './screens/legal.js';
import { captureUtm } from './utm.js';
import './theme.css';

interface Config {
  region: string;
  userPoolClientId: string;
  loginDomain: string;
}

/** Guarda por aba (sessionStorage); sem armazenamento, o fluxo só perde a lembrança entre a ida e a volta do Google. */
const tabStore = (key: string) => ({
  get: () => { try { return sessionStorage.getItem(key); } catch { return null; } },
  set: (value: string) => { try { sessionStorage.setItem(key, value); } catch { /* sem armazenamento */ } },
  clear: () => { try { sessionStorage.removeItem(key); } catch { /* nada a limpar */ } },
});

const LEGAL_PAGES: Record<string, keyof typeof LEGAL> = { '/termos': 'terms', '/privacidade': 'privacy' };

const start = async () => {
  const root = document.getElementById('app');
  if (!root) return;
  const legal = LEGAL_PAGES[location.pathname];
  if (legal) {
    render(<div class="mx-auto grid max-w-5xl gap-6 px-4 py-6"><LegalPage doc={LEGAL[legal]} /><Footer /></div>, root);
    return;
  }
  // Antes de tudo: a origem do anúncio fica guardada para depois do login.
  const utm = captureUtm(location.search, tabStore('gg.utm'));
  const config = (await (await fetch('/config.json', { cache: 'no-store' })).json()) as Config;
  const cognito = createCognito({ region: config.region, clientId: config.userPoolClientId });
  const session = createSession(cognito, browserStorage);
  const google = createGoogle(
    { loginDomain: config.loginDomain, clientId: config.userPoolClientId, redirectUri: `${location.origin}/`, scope: 'openid email profile aws.cognito.signin.user.admin' },
    { fetchFn: fetch.bind(window), store: tabStore('gg.google'), random: () => crypto.getRandomValues(new Uint8Array(32)), now: () => Date.now() },
  );
  const returned = await google.finish(location.search);
  if (returned) history.replaceState(null, '', '/');
  if (returned && 'access' in returned) session.signedIn(returned);
  const wants = tabStore('gg.want');
  const loginError = returned && 'error' in returned ? returned.error : null;
  if (loginError) wants.clear();
  render(
    <App api={createLandingApi(session)} session={session} google={google} utm={utm} wants={wants} guard={createLoginGuard(tabStore('gg.retry'))} loginError={loginError}
      go={(url) => { location.assign(url); }} />,
    root,
  );
};

void start();
