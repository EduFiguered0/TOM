import type { MeResponse } from '@tom/contracts';
import { useState } from 'preact/hooks';
import type { Api } from '../api.js';
import { bigPrimary, Feedback, input, label } from '../ui.js';

/** Conta antiga: o nome foi separado no primeiro espaço; a pessoa confere uma vez (e corrige se precisar). */
export const NameReviewCard = ({ me, api, onSaved }: { me: MeResponse; api: Api; onSaved: (me: MeResponse) => void }) => {
  const [firstName, setFirstName] = useState(me.profile.firstName);
  const [lastName, setLastName] = useState(me.profile.lastName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = (e: Event) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    void api.confirmName(firstName.trim(), lastName.trim())
      .then((result) => { if (result.ok) onSaved(result.body); else setError(result.error.message); })
      .catch((err: unknown) => { setError((err as Error).message); })
      .finally(() => { setBusy(false); });
  };

  return (
    <form class="m-0 flex flex-col gap-3 rounded-xl border border-dashed border-warn p-4" onSubmit={submit}>
      <p class="m-0"><b>Confira seu nome</b></p>
      <p class="m-0 text-sm">Separamos seu nome em nome e sobrenome, como o TOM pede. Confira e salve.</p>
      <label class={label}>Nome
        <input class={input} autocomplete="given-name" required value={firstName} onInput={(e) => { setFirstName(e.currentTarget.value); }} />
      </label>
      <label class={label}>Sobrenome
        <input class={input} autocomplete="family-name" required value={lastName} onInput={(e) => { setLastName(e.currentTarget.value); }} />
      </label>
      <button type="submit" class={bigPrimary} disabled={busy}>{busy ? 'Salvando…' : 'Salvar'}</button>
      <Feedback message={error ? { ok: false, text: error } : null} />
    </form>
  );
};
