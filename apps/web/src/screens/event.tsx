import type { CreateEventResponse } from '@tom/contracts';
import { useState } from 'preact/hooks';
import type { Api } from '../api.js';

/** ADM gera o token do enviador do dia; ele aparece uma vez só. */
export const EventCard = ({ api }: { api: Api }) => {
  const [label, setLabel] = useState('');
  const [created, setCreated] = useState<CreateEventResponse | null>(null);
  const [revoked, setRevoked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try { await action(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const create = (e: Event) => {
    e.preventDefault();
    void run(async () => {
      const result = await api.createEvent(label.trim());
      if (!result.ok) { setError(result.error.message); return; }
      setCreated(result.body);
      setRevoked(false);
      setCopied(false);
    });
  };

  const revoke = () => {
    if (created) {
      void run(async () => {
        const result = await api.revokeEvent(created.id);
        if (result.ok) setRevoked(true);
        else setError(result.error.message);
      });
    }
  };

  const copy = (text: string) => {
    void navigator.clipboard.writeText(text).then(() => { setCopied(true); }, () => { setError('Não foi possível copiar; selecione e copie manualmente.'); });
  };

  const command = created
    ? `$env:TOM_UPLOAD_TOKEN="${created.token}"; npm run uploader -- --folder "<pasta de relatórios do TOM>" --api ${location.origin}/api`
    : '';

  return (
    <section class="card">
      <h2>Evento do dia</h2>
      {!created ? (
        <form onSubmit={create}>
          <p class="muted">Gere o token que o enviador usa no notebook do TOM. Ele vale só para este evento e pode ser revogado.</p>
          <label for="event-label">Nome do evento</label>
          <input id="event-label" required minLength={2} value={label} onInput={(e) => { setLabel(e.currentTarget.value); }} />
          <button type="submit" disabled={busy}>Gerar token</button>
        </form>
      ) : (
        <div>
          <p><b>{created.label}</b>{revoked ? ' · token revogado' : ''}</p>
          {!revoked && (
            <>
              <p class="muted">Copie agora: o token não aparece de novo. No notebook do TOM, no PowerShell:</p>
              <p class="code">{command}</p>
              <button type="button" onClick={() => { copy(command); }}>{copied ? 'Copiado ✓' : 'Copiar comando'}</button>
              <button type="button" class="link" disabled={busy} onClick={revoke}>Revogar token</button>
            </>
          )}
          <button type="button" class="link" onClick={() => { setCreated(null); setLabel(''); }}>Novo evento</button>
        </div>
      )}
      {error && <p class="error" role="alert">{error}</p>}
    </section>
  );
};
