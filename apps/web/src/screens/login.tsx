import { useState } from 'preact/hooks';
import { AuthError, type Cognito, type Tokens } from '../auth/cognito.js';

interface Props {
  cognito: Cognito;
  onSignedIn: (tokens: Tokens) => void;
}

const message = (e: unknown) => (e instanceof AuthError ? e.message : 'Sem conexão. Tente de novo.');

export const Login = ({ cognito, onSignedIn }: Props) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enter = (e: Event) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    cognito.signIn(email, password).then(onSignedIn, (err: unknown) => { setError(message(err)); }).finally(() => { setBusy(false); });
  };

  return (
    <section class="card">
      <h1>Entrar</h1>
      <form onSubmit={enter}>
        <label for="email">E-mail</label>
        <input id="email" type="email" autocomplete="email" required value={email} onInput={(e) => { setEmail(e.currentTarget.value); }} />
        <label for="password">Senha</label>
        <input id="password" type="password" autocomplete="current-password" required value={password} onInput={(e) => { setPassword(e.currentTarget.value); }} />
        <button type="submit" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
      </form>
      {error && <p class="error" role="alert">{error}</p>}
    </section>
  );
};
