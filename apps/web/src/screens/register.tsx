import type { MeResponse } from '@tom/contracts';
import { useState } from 'preact/hooks';
import type { Api } from '../api.js';
import { bigPrimary, card, Feedback, input, label, muted, title } from '../ui.js';
import { isMinor, toRegisterRequest, type RegisterForm } from '../flow.js';

interface Props {
  api: Api;
  onRegistered: (me: MeResponse) => void;
}

export const Register = ({ api, onRegistered }: Props) => {
  const [form, setForm] = useState<RegisterForm>({ firstName: '', lastName: '', birthYear: '', phone: '', playerId: '', guardianConsent: false });
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
    <section class={card}>
      <h1 class={title}>Cadastro</h1>
      <p class={muted}>
        Usamos estes dados só para organizar os torneios, o seu histórico e um ranking futuro. Nada é compartilhado com terceiros.{' '}
        <a class="text-accent" href="/privacidade" target="_blank" rel="noopener">Política de privacidade</a>
      </p>
      <form class="m-0 flex flex-col gap-3" onSubmit={(e) => { void submit(e); }}>
        <label class={label}>Nome<input class={input} autocomplete="given-name" required maxLength={50} value={form.firstName} onInput={field('firstName')} /></label>
        <label class={label}>Sobrenome<input class={input} autocomplete="family-name" required maxLength={50} value={form.lastName} onInput={field('lastName')} /></label>
        <label class={label}>Ano de nascimento<input class={input} inputmode="numeric" maxLength={4} required value={form.birthYear} onInput={field('birthYear')} /></label>
        <label class={label}>Player ID da Pokémon
          <input class={input} inputmode="numeric" aria-describedby="pid-hint" value={form.playerId} onInput={field('playerId')} />
          <span id="pid-hint" class="text-xs">Obrigatório para jogar</span>
        </label>
        <label class={label}>Telefone (opcional)<input class={input} type="tel" autocomplete="tel" value={form.phone} onInput={field('phone')} /></label>
        {minor && (
          <label class="flex items-start gap-3 text-sm text-text">
            <input type="checkbox" class="mt-1 size-4 accent-accent" checked={form.guardianConsent} onChange={field('guardianConsent')} />
            Sou o responsável legal por este jogador e autorizo o uso dos dados acima.
          </label>
        )}
        <button type="submit" class={bigPrimary} disabled={busy}>{busy ? 'Salvando…' : 'Cadastrar'}</button>
      </form>
      <Feedback message={error ? { ok: false, text: error } : null} />
    </section>
  );
};
