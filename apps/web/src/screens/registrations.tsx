import type { AccountResponse, EventDto, RegistrationDto, RegistrationsResponse } from '@tom/contracts';
import { useCallback, useEffect, useState } from 'preact/hooks';
import type { Api } from '../api.js';

/** O ADM digita no TOM enquanto as pessoas chegam: a lista se atualiza sozinha. */
const POLL_MS = 10_000;

/** Painel de inscritos: a lista para digitar no TOM (um a um), confirmação de presença e inscrição à mão. */
export const RegistrationsCard = ({ api, event }: { api: Api; event: EventDto }) => {
  const [data, setData] = useState<RegistrationsResponse | null>(null);
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<AccountResponse[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await api.registrations(event.id);
      if (result.ok) setData(result.body);
    } catch {
      // Sem conexão: mantém a última lista.
    }
  }, [api, event.id]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => { void load(); }, POLL_MS);
    return () => { clearInterval(timer); };
  }, [load]);

  const run = async (action: () => Promise<{ ok: boolean; error?: { message: string } }>) => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await action();
      if (!result.ok) setMessage({ ok: false, text: result.error?.message ?? 'Erro inesperado.' });
      await load();
    } catch (e) {
      setMessage({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const copy = (text: string) => {
    void navigator.clipboard.writeText(text).then(
      () => { setMessage({ ok: true, text: `Copiado: ${text}` }); },
      () => { setMessage({ ok: false, text: 'Não foi possível copiar; selecione e copie manualmente.' }); },
    );
  };

  const search = (e: Event) => {
    e.preventDefault();
    void run(async () => {
      const result = await api.searchAccounts(query.trim());
      setFound(result.ok ? result.body : null);
      return result;
    });
  };

  const row = (r: RegistrationDto) => (
    <li key={r.accountId} class={r.removed ? 'removed' : ''}>
      <div>
        <b>{r.playerId}</b> · {r.name} · {r.birthYear}
        {r.confirmed && !r.removed && r.inRound === false && <span class="error"> · Não está nas guias da rodada atual</span>}
      </div>
      {!r.removed && (
        <div class="row-actions">
          <button type="button" class="link" onClick={() => { copy(r.playerId); }}>Copiar ID</button>
          <button type="button" class="link" onClick={() => { copy(r.name); }}>Copiar nome</button>
          {r.confirmed
            ? <span class="ok">Confirmado</span>
            : (
              <>
                <span class="muted">Pendente</span>
                <button type="button" class="link" disabled={busy} onClick={() => { void run(() => api.registrationAction(event.id, r.accountId, 'confirm')); }}>
                  Confirmar por ele
                </button>
              </>
            )}
          <label class="check">
            <input type="checkbox" checked={r.launched} disabled={busy} onChange={(e) => { const on = e.currentTarget.checked; void run(() => api.setLaunched(event.id, r.accountId, on)); }} />
            Lançado no TOM
          </label>
          <button
            type="button"
            class="link"
            disabled={busy}
            onClick={() => { if (confirm(`Remover ${r.name} do evento?`)) void run(() => api.registrationAction(event.id, r.accountId, 'remove')); }}
          >
            Remover
          </button>
        </div>
      )}
    </li>
  );

  return (
    <section class="card">
      <h2>Inscritos</h2>
      {data && (
        <p>
          <b>{data.confirmed} de {data.total} confirmados</b> · <b>{data.launched} de {data.total} lançados</b>
        </p>
      )}
      {data?.registrations.length === 0 && <p class="muted">Ninguém inscrito ainda. O QR está na TV.</p>}
      {data && data.registrations.length > 0 && <ul class="list">{data.registrations.map(row)}</ul>}
      <form onSubmit={search}>
        <label for="add-query">Inscrever à mão (nome ou Player ID)</label>
        <input id="add-query" required minLength={2} value={query} onInput={(e) => { setQuery(e.currentTarget.value); }} />
        <button type="submit" disabled={busy}>Buscar</button>
      </form>
      {found && (found.length === 0 ? <p class="muted">Nenhuma conta encontrada.</p> : (
        <ul class="list">
          {found.map((a) => (
            <li key={a.id}>
              {a.profile.name} · {a.playerId ?? 'sem Player ID'}
              <button type="button" class="link" disabled={busy} onClick={() => { void run(() => api.addRegistration(event.id, a.id)); }}>Inscrever</button>
            </li>
          ))}
        </ul>
      ))}
      {message && <p class={message.ok ? 'ok' : 'error'} role={message.ok ? 'status' : 'alert'}>{message.text}</p>}
    </section>
  );
};
