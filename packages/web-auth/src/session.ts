import { AuthError, type Cognito, type Tokens } from './cognito.js';

const KEY = 'tom.auth';
/** Renova o token de acesso um pouco antes de expirar. */
const MARGIN_MS = 60_000;

/** Armazenamento do navegador pode falhar (aba anônima, bloqueio); o login então vale só enquanto a aba estiver aberta. */
export interface Storage {
  get(): string | null;
  set(value: string): void;
  clear(): void;
}

export const browserStorage: Storage = {
  get: () => { try { return localStorage.getItem(KEY); } catch { return null; } },
  set: (value) => { try { localStorage.setItem(KEY, value); } catch { /* só na memória */ } },
  clear: () => { try { localStorage.removeItem(KEY); } catch { /* nada a limpar */ } },
};

/** Tokens do dispositivo: mantém o login por até 30 dias e renova o token de acesso sozinho. */
export const createSession = (cognito: Cognito, storage: Storage, now = () => Date.now()) => {
  const read = (): Tokens | null => {
    try { return JSON.parse(storage.get() ?? 'null') as Tokens | null; } catch { return null; }
  };
  let tokens: Tokens | null = read();
  let refreshing: Promise<Tokens> | null = null;

  const keep = (next: Tokens | null) => {
    tokens = next;
    if (next) storage.set(JSON.stringify(next));
    else storage.clear();
  };

  return {
    get loggedIn() { return tokens !== null; },

    signedIn(next: Tokens) { keep(next); },

    /**
     * Token de acesso válido; renova se estiver perto de expirar. null = precisa entrar de novo.
     * Falha de rede na renovação lança (a tela mostra "sem conexão" e tenta de novo): só o Cognito recusando desloga.
     */
    async accessToken(): Promise<string | null> {
      // Sem login nesta aba: outra aba (ex.: o painel, ao lado da TV) pode ter entrado.
      tokens ??= read();
      if (!tokens) return null;
      if (tokens.expiresAt - MARGIN_MS > now()) return tokens.access;
      try {
        refreshing ??= cognito.refresh(tokens.refresh);
        const next = await refreshing;
        keep(next);
        return next.access;
      } catch (error) {
        if (!(error instanceof AuthError)) throw error;
        keep(null);
        return null;
      } finally {
        refreshing = null;
      }
    },

    async signOut() {
      const refresh = tokens?.refresh;
      keep(null);
      if (refresh) await cognito.revoke(refresh).catch(() => undefined);
    },
  };
};

export type Session = ReturnType<typeof createSession>;
