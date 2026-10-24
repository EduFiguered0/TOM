import type { MeResponse } from '@tom/contracts';
import { useState } from 'preact/hooks';
import type { Api } from '../api.js';

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
    <form class="notice" onSubmit={submit}>
      <p><b>Informe seu Player ID</b> da Pokémon para jogar e reportar resultados.</p>
      <label for="claim-pid">Player ID</label>
      <input id="claim-pid" inputmode="numeric" required value={playerId} onInput={(e) => { setPlayerId(e.currentTarget.value); }} />
      <button type="submit" disabled={busy}>{busy ? 'Salvando…' : 'Salvar'}</button>
      {error && <p class="error" role="alert">{error}</p>}
    </form>
  );
};
