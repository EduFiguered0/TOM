import { render } from 'preact';
import { createApi } from './api.js';
import { App } from './app.js';
import { createCognito } from './auth/cognito.js';
import { browserStorage, createSession } from './auth/session.js';
import { demoBoard } from './tv/demo-board.js';
import { LiveTv } from './tv/live.js';
import { Tv } from './tv/tv.js';
import './styles.css';

interface Config {
  region: string;
  userPoolClientId: string;
}

/** A configuração vem do deploy (`config.json`): o mesmo build serve produção e testes. */
const start = async () => {
  const root = document.getElementById('app');
  if (!root) return;
  // TV do salão: pública, sem login. /tv?demo mostra dados fictícios para conferir o layout.
  if (location.pathname.startsWith('/tv')) {
    render(new URLSearchParams(location.search).has('demo') ? <Tv board={demoBoard()} /> : <LiveTv />, root);
    return;
  }
  const config = (await (await fetch('/config.json', { cache: 'no-store' })).json()) as Config;
  const cognito = createCognito({ region: config.region, clientId: config.userPoolClientId });
  const session = createSession(cognito, browserStorage);
  render(<App cognito={cognito} session={session} api={createApi(session)} />, root);
};

void start();
