import type { Tokens } from './cognito.js';

/** Entrada pelo Google via domínio de login do Cognito (OAuth com PKCE): o site manda direto para o Google. */

export interface GoogleConfig {
  loginDomain: string;
  clientId: string;
  redirectUri: string;
}

/** Guarda o verifier e o state entre a ida ao Google e a volta (sessionStorage no navegador). */
export interface GoogleStore {
  get(): string | null;
  set(value: string): void;
  clear(): void;
}

export interface GoogleDeps {
  fetchFn: typeof fetch;
  store: GoogleStore;
  random: () => Uint8Array;
  now: () => number;
}

const SCOPE = 'openid email aws.cognito.signin.user.admin';
const CANCELLED = 'Entrada pelo Google cancelada.';
const FAILED = 'Não foi possível entrar pelo Google. Tente de novo.';

const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const challenge = async (verifier: string) =>
  base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));

export const createGoogle = ({ loginDomain, clientId, redirectUri }: GoogleConfig, { fetchFn, store, random, now }: GoogleDeps) => {
  const saved = (): { verifier: string; state: string } | null => {
    try { return JSON.parse(store.get() ?? 'null') as { verifier: string; state: string } | null; } catch { return null; }
  };

  const exchange = async (code: string, verifier: string): Promise<Tokens | null> => {
    const response = await fetchFn(`${loginDomain}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', client_id: clientId, code, redirect_uri: redirectUri, code_verifier: verifier }).toString(),
    });
    const data = (await response.json()) as { access_token?: string; refresh_token?: string; expires_in?: number };
    if (!response.ok || !data.access_token || !data.refresh_token || !data.expires_in) return null;
    return { access: data.access_token, refresh: data.refresh_token, expiresAt: now() + data.expires_in * 1000 };
  };

  return {
    async authorizeUrl(): Promise<string> {
      const verifier = base64url(random());
      const state = base64url(random().slice(0, 16));
      store.set(JSON.stringify({ verifier, state }));
      const params = new URLSearchParams({
        identity_provider: 'Google',
        response_type: 'code',
        client_id: clientId,
        redirect_uri: redirectUri,
        scope: SCOPE,
        state,
        code_challenge: await challenge(verifier),
        code_challenge_method: 'S256',
      });
      return `${loginDomain}/oauth2/authorize?${params.toString()}`;
    },

    /** Volta do Google: `null` se a URL não for um retorno; senão tokens ou a mensagem para a tela de login. */
    async finish(search: string): Promise<Tokens | { error: string } | null> {
      const params = new URLSearchParams(search);
      const code = params.get('code');
      if (!code && !params.has('error')) return null;
      const pending = saved();
      store.clear();
      if (!code) return { error: CANCELLED };
      if (!pending || pending.state !== params.get('state')) return { error: FAILED };
      try {
        return (await exchange(code, pending.verifier)) ?? { error: FAILED };
      } catch {
        return { error: FAILED };
      }
    },
  };
};

export type Google = ReturnType<typeof createGoogle>;
