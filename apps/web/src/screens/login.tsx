import { useState } from 'preact/hooks';
import { AuthError, type Cognito, type Tokens } from '../auth/cognito.js';
import type { Google } from '../auth/google.js';

interface Props {
  cognito: Cognito;
  google: Pick<Google, 'authorizeUrl'> | null;
  initialError: string | null;
  onSignedIn: (tokens: Tokens) => void;
}

/** `reset` = o código do "Esqueci minha senha" já foi enviado. */
type Mode = 'signin' | 'signup' | 'forgot' | 'reset';

const message = (e: unknown) => (e instanceof AuthError ? e.message : 'Sem conexão. Tente de novo.');

const TITLE: Record<Mode, string> = { signin: 'Entrar', signup: 'Criar conta', forgot: 'Esqueci minha senha', reset: 'Criar nova senha' };

export const Login = ({ cognito, google, initialError, onSignedIn }: Props) => {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError);
  const [info, setInfo] = useState<string | null>(null);

  const go = (next: Mode) => { setMode(next); setError(null); setInfo(null); setPassword(''); };

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setInfo(null);
    try { await action(); } catch (e) { setError(message(e)); } finally { setBusy(false); }
  };

  const submit = (e: Event) => {
    e.preventDefault();
    void run(async () => {
      if (mode === 'signin') onSignedIn(await cognito.signIn(email, password));
      if (mode === 'signup') onSignedIn(await cognito.signUp(email, password));
      if (mode === 'forgot') { await cognito.forgotPassword(email); setCode(''); setMode('reset'); setInfo(`Enviamos um código para ${email.trim()}. Confira também o spam.`); }
      if (mode === 'reset') { await cognito.resetPassword(email, code, password); go('signin'); setInfo('Senha salva. Entre com a nova senha.'); }
    });
  };

  const withGoogle = () => { if (google) void run(async () => { location.assign(await google.authorizeUrl()); }); };

  return (
    <section class="card">
      <h1>{TITLE[mode]}</h1>
      {google && (mode === 'signin' || mode === 'signup') && (
        <>
          <button type="button" disabled={busy} onClick={withGoogle}>Entrar com o Google</button>
          <p class="muted center">ou com e-mail e senha</p>
        </>
      )}
      <form onSubmit={submit}>
        <label for="email">E-mail</label>
        <input id="email" type="email" autocomplete="email" required readOnly={mode === 'reset'} value={email} onInput={(e) => { setEmail(e.currentTarget.value); }} />
        {mode === 'reset' && (
          <>
            <label for="code">Código recebido por e-mail</label>
            <input id="code" inputmode="numeric" autocomplete="one-time-code" required value={code} onInput={(e) => { setCode(e.currentTarget.value); }} />
          </>
        )}
        {mode !== 'forgot' && (
          <>
            <label for="password">{mode === 'reset' ? 'Nova senha' : 'Senha'}</label>
            <input
              id="password" type="password" required minLength={mode === 'signin' ? undefined : 8}
              autocomplete={mode === 'signin' ? 'current-password' : 'new-password'}
              value={password} onInput={(e) => { setPassword(e.currentTarget.value); }}
            />
            {mode !== 'signin' && <p class="muted">Pelo menos 8 caracteres, com letras e números.</p>}
          </>
        )}
        <button type="submit" disabled={busy}>
          {busy ? 'Aguarde…' : { signin: 'Entrar', signup: 'Criar conta', forgot: 'Enviar código', reset: 'Salvar senha' }[mode]}
        </button>
      </form>
      {info && <p class="ok" role="status">{info}</p>}
      {error && <p class="error" role="alert">{error}</p>}
      {mode === 'signin' && (
        <>
          <button type="button" class="link" onClick={() => { go('signup'); }}>Ainda não tenho conta</button>
          <button type="button" class="link" onClick={() => { go('forgot'); }}>Esqueci minha senha</button>
        </>
      )}
      {mode !== 'signin' && <button type="button" class="link" onClick={() => { go('signin'); }}>Voltar para entrar</button>}
    </section>
  );
};
