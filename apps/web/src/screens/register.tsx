import type { MeResponse } from '@tom/contracts';
import { useState } from 'preact/hooks';
import type { Api } from '../api.js';
import { isMinor, toRegisterRequest, type RegisterForm } from '../flow.js';

interface Props {
  api: Api;
  onRegistered: (me: MeResponse) => void;
}

export const Register = ({ api, onRegistered }: Props) => {
  const [form, setForm] = useState<RegisterForm>({ name: '', birthYear: '', phone: '', playerId: '', guardianConsent: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const minor = form.birthYear.length === 4 && isMinor(Number(form.birthYear));
  const field = (key: keyof RegisterForm) => (e: Event) => {
    const input = e.currentTarget as HTMLInputElement;
    setForm({ ...form, [key]: input.type === 'checkbox' ? input.checked : input.value });
  };

  const submit = async (e: Event) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await api.register(toRegisterRequest(form));
      if (result.ok) onRegistered(result.body);
      else setError(result.error.message);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section class="card">
      <h1>Cadastro</h1>
      <p class="muted">Usamos estes dados só para organizar os torneios, o seu histórico e um ranking futuro. Nada é compartilhado com terceiros.</p>
      <form onSubmit={(e) => { void submit(e); }}>
        <label for="name">Nome completo</label>
        <input id="name" autocomplete="name" required minLength={2} value={form.name} onInput={field('name')} />
        <label for="year">Ano de nascimento</label>
        <input id="year" inputmode="numeric" maxLength={4} required value={form.birthYear} onInput={field('birthYear')} />
        <label for="pid">Player ID da Pokémon</label>
        <input id="pid" inputmode="numeric" value={form.playerId} onInput={field('playerId')} />
        <label for="phone">Telefone (opcional)</label>
        <input id="phone" type="tel" autocomplete="tel" value={form.phone} onInput={field('phone')} />
        {minor && (
          <label class="check">
            <input type="checkbox" checked={form.guardianConsent} onChange={field('guardianConsent')} />
            Sou o responsável legal por este jogador e autorizo o uso dos dados acima.
          </label>
        )}
        <button type="submit" disabled={busy}>{busy ? 'Salvando…' : 'Cadastrar'}</button>
      </form>
      {error && <p class="error" role="alert">{error}</p>}
    </section>
  );
};
