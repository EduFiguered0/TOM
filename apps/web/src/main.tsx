import { render } from 'preact';
import { createApi } from './api.js';
import { App } from './app.js';
import { createCognito } from './auth/cognito.js';
import { createGoogle } from './auth/google.js';
import { browserStorage, createSession } from './auth/session.js';
import { HomePage } from './public/home-page.js';
import { PrivacyPage } from './public/privacy-page.js';
import { createPendingJoin, inviteCodeOf, joinCodeOf } from './pending-join.js';
import { pageFor } from './routes.js';
import { demoBoard, demoStandings } from './tv/demo-board.js';
import { createPhotoCache } from './photo/photo-cache.js';
import { LiveTv } from './tv/live.js';
import { PartialTv } from './tv/partial.js';
import { Tv } from './tv/tv.js';
import { WaitingTv } from './tv/waiting.js';
import './theme.css';

interface Config {
  region: string;
  userPoolClientId: string;
  loginDomain: string;
  /** O Google só aparece depois de ligado no Cognito (README, "Ativar o Google"). */
  google: boolean;
}

/** Verifier e state do Google: só enquanto a aba vai ao Google e volta. */
const googleStore = {
  get: () => { try { return sessionStorage.getItem('tom.google'); } catch { return null; } },
  set: (value: string) => { try { sessionStorage.setItem('tom.google', value); } catch { /* sem armazenamento: a volta falha com mensagem */ } },
  clear: () => { try { sessionStorage.removeItem('tom.google'); } catch { /* nada a limpar */ } },
};

/** A configuração vem do deploy (`config.json`): o mesmo build serve produção e testes. */
const start = async () => {
  const root = document.getElementById('app');
  if (!root) return;
  // /tv?demo mostra dados fictícios para conferir o layout, sem login (?demo=classificacao: entre rodadas; ?demo=espera: sem evento).
  const demo = new URLSearchParams(location.search).get('demo');
  if (pageFor(location.pathname) === 'tv' && demo !== null) {
    const screen = demo === 'classificacao' ? <PartialTv board={demoStandings()} />
      : demo === 'espera' ? <WaitingTv board={{ state: 'idle', serverTime: new Date().toISOString() }} />
      : <Tv board={demoBoard()} />;
    render(screen, root);
    return;
  }
  if (pageFor(location.pathname) === 'privacy') {
    render(<PrivacyPage />, root);
    return;
  }
  // QR do evento: guarda o código (sobrevive ao login e à ida ao Google) e segue para a conta.
  const pendingJoin = createPendingJoin(sessionStorage);
  const code = joinCodeOf(location.pathname);
  if (code) {
    pendingJoin.save(code);
    history.replaceState(null, '', '/conta');
  }
  // Convite de juiz: mesmo caminho do QR do evento, guardado à parte.
  const pendingInvite = createPendingJoin(sessionStorage, 'tom.invite');
  const invite = inviteCodeOf(location.pathname);
  if (invite) {
    pendingInvite.save(invite);
    history.replaceState(null, '', '/conta');
  }
  const config = (await (await fetch('/config.json', { cache: 'no-store' })).json()) as Config;
  const cognito = createCognito({ region: config.region, clientId: config.userPoolClientId });
  const session = createSession(cognito, browserStorage);
  // TV do salão: extensão do painel do ADM, com a mesma sessão (aberta em "Abrir TV ↗").
  if (pageFor(location.pathname) === 'tv') {
    // Sem login, a TV mostra o aviso e segue consultando: entra sozinha quando o ADM fizer login em outra aba.
    const tvApi = createApi(session);
    const photos = createPhotoCache(async (id) => { const r = await tvApi.photo(id); return r.ok ? r.body.photo : null; });
    render(<LiveTv load={tvApi.board} photos={photos} />, root);
    return;
  }
  const google = createGoogle(
    { loginDomain: config.loginDomain, clientId: config.userPoolClientId, redirectUri: `${location.origin}/` },
    { fetchFn: fetch.bind(window), store: googleStore, random: () => crypto.getRandomValues(new Uint8Array(32)), now: () => Date.now() },
  );
  // Volta do Google (sempre em /): guarda o login, limpa o código da URL e leva para a conta.
  const returned = await google.finish(location.search);
  if (returned) history.replaceState(null, '', '/conta');
  if (returned && 'access' in returned) session.signedIn(returned);
  const loginError = returned && 'error' in returned ? returned.error : null;
  if (pageFor(location.pathname) === 'home') {
    const renderHome = () => {
      render(<HomePage loggedIn={session.loggedIn} onSignOut={() => { void session.signOut().then(renderHome); }} />, root);
    };
    renderHome();
    return;
  }
  render(
    <App
      cognito={cognito} session={session} api={createApi(session)} google={config.google ? google : null}
      loginError={loginError} pendingJoin={pendingJoin} pendingInvite={pendingInvite}
    />,
    root,
  );
};

void start();
