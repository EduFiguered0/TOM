import { render } from 'preact';
import { createApi } from './api.js';
import { App } from './app.js';
import { createCognito } from './auth/cognito.js';
import { browserStorage, createSession } from './auth/session.js';
import './styles.css';

interface Config {
  region: string;
  userPoolClientId: string;
}

/** A configuração vem do deploy (`config.json`): o mesmo build serve produção e testes. */
const start = async () => {
  const config = (await (await fetch('/config.json', { cache: 'no-store' })).json()) as Config;
  const cognito = createCognito({ region: config.region, clientId: config.userPoolClientId });
  const session = createSession(cognito, browserStorage);
  const root = document.getElementById('app');
  if (root) render(<App cognito={cognito} session={session} api={createApi(session)} />, root);
};

void start();
