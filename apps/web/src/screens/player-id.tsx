import type { MeResponse } from '@tom/contracts';
import { useState } from 'preact/hooks';
import type { Api } from '../api.js';
import { bigPrimary, Feedback, input, label } from '../ui.js';

/** Conta sem Player ID (ex.: entrou pelo Google) informa antes de jogar. Para trocar depois, só pelo ADM. */
export const PlayerIdCard = ({ api, onSaved }: { api: Api; onSaved: (me: MeResponse) => void }) => {
  const [playerId, setPlayerId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = (e: Event) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    void api.claimPlayerId(playerId.trim())
      .then((result) => { if (result.ok) onSaved(result.body); else setError(result.error.message); })
      .catch((err: unknown) => { setError((err as Error).message); })
      .finally(() => { setBusy(false); });
  };

  return (
    <form class="m-0 flex flex-col gap-3 rounded-xl border border-dashed border-warn p-4" onSubmit={submit}>
      <p class="m-0"><b>Informe seu Player ID</b> da Pokémon para jogar e reportar resultados.</p>
      <label class={label}>Player ID
        <input class={input} inputmode="numeric" required value={playerId} onInput={(e) => { setPlayerId(e.currentTarget.value); }} />
      </label>
      <button type="submit" class={bigPrimary} disabled={busy}>{busy ? 'Salvando…' : 'Salvar'}</button>
      <Feedback message={error ? { ok: false, text: error } : null} />
    </form>
  );
};
