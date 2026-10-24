import { useState } from 'preact/hooks';
import { AuthError, type Cognito, type PendingCode, type Tokens } from '../auth/cognito.js';

interface Props {
  cognito: Cognito;
  onSignedIn: (tokens: Tokens) => void;
}

const message = (e: unknown) => (e instanceof AuthError ? e.message : 'Sem conexão. Tente de novo.');

export const Login = ({ cognito, onSignedIn }: Props) => {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [pending, setPending] = useState<PendingCode | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try { await action(); } catch (e) { setError(message(e)); } finally { setBusy(false); }
  };

  const send = (e: Event) => {
    e.preventDefault();
    void run(async () => { setPending(await cognito.start(email)); setCode(''); });
  };

  const enter = (e: Event) => {
    e.preventDefault();
    if (pending) void run(async () => { onSignedIn(await cognito.verify(pending, code)); });
  };

  return (
    <section class="card">
      <h1>Entrar</h1>
      {!pending ? (
        <form onSubmit={send}>
          <p class="muted">Sem senha: enviamos um código para o seu e-mail. Na primeira vez, a conta é criada.</p>
          <label for="email">E-mail</label>
          <input id="email" type="email" autocomplete="email" required value={email} onInput={(e) => { setEmail(e.currentTarget.value); }} />
          <button type="submit" disabled={busy}>{busy ? 'Enviando…' : 'Receber código'}</button>
        </form>
      ) : (
        <form onSubmit={enter}>
          <p class="muted">Código enviado para <b>{pending.email}</b>. Confira também o spam.</p>
          {/* Cadastro manda 6 dígitos; login, 8. */}
          <label for="code">Código recebido por e-mail</label>
          <input id="code" inputmode="numeric" autocomplete="one-time-code" maxLength={8} pattern="[0-9]{6,8}" required value={code} onInput={(e) => { setCode(e.currentTarget.value); }} />
          <button type="submit" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
          <button type="button" class="link" onClick={() => { setPending(null); }}>Usar outro e-mail</button>
        </form>
      )}
      {error && <p class="error" role="alert">{error}</p>}
    </section>
  );
};
