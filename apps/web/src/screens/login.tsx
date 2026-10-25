import { useState } from 'preact/hooks';
import { AuthError, type Cognito, type Tokens } from '../auth/cognito.js';
import type { Google } from '../auth/google.js';
import { bigGhost, bigPrimary, card, Feedback, input, label, muted, textButton, title } from '../ui.js';

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
    <section class={card}>
      <h1 class={title}>{TITLE[mode]}</h1>
      {google && (mode === 'signin' || mode === 'signup') && (
        <>
          <button type="button" class={bigGhost} disabled={busy} onClick={withGoogle}>Entrar com o Google</button>
          <p class={`${muted} text-center`}>ou com e-mail e senha</p>
        </>
      )}
      <form class="m-0 flex flex-col gap-3" onSubmit={submit}>
        <label class={label}>E-mail
          <input class={input} type="email" autocomplete="email" required readOnly={mode === 'reset'} value={email} onInput={(e) => { setEmail(e.currentTarget.value); }} />
        </label>
        {mode === 'reset' && (
          <label class={label}>Código recebido por e-mail
            <input class={input} inputmode="numeric" autocomplete="one-time-code" required value={code} onInput={(e) => { setCode(e.currentTarget.value); }} />
          </label>
        )}
        {mode !== 'forgot' && (
          <label class={label}>{mode === 'reset' ? 'Nova senha' : 'Senha'}
            <input
              class={input} type="password" required minLength={mode === 'signin' ? undefined : 8}
              autocomplete={mode === 'signin' ? 'current-password' : 'new-password'}
              value={password} onInput={(e) => { setPassword(e.currentTarget.value); }}
            />
            {mode !== 'signin' && <span class="text-xs">Pelo menos 8 caracteres, com uma letra minúscula e um número.</span>}
          </label>
        )}
        <button type="submit" class={bigPrimary} disabled={busy}>
          {busy ? 'Aguarde…' : { signin: 'Entrar', signup: 'Criar conta', forgot: 'Enviar código', reset: 'Salvar senha' }[mode]}
        </button>
      </form>
      <Feedback message={info ? { ok: true, text: info } : error ? { ok: false, text: error } : null} />
      {mode === 'signin' && (
        <div class="flex justify-between">
          <button type="button" class={textButton} onClick={() => { go('signup'); }}>Ainda não tenho conta</button>
          <button type="button" class={textButton} onClick={() => { go('forgot'); }}>Esqueci minha senha</button>
        </div>
      )}
      {mode !== 'signin' && <button type="button" class={textButton} onClick={() => { go('signin'); }}>Voltar para entrar</button>}
    </section>
  );
};
