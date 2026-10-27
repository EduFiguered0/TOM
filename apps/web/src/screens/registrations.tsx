import type { AccountResponse, EventDto, RegistrationDto, RegistrationsResponse } from '@tom/contracts';
import { useCallback, useEffect, useState } from 'preact/hooks';
import type { Api } from '../api.js';
import { field as input, ghost, linkButton as action } from '../ui.js';

/** O ADM digita no TOM enquanto as pessoas chegam: a lista se atualiza sozinha. */
const POLL_MS = 10_000;

/** Inscritos do evento, compartilhados pela casca (contador do menu) e pelas abas Evento e Inscritos. */
export const useRegistrations = (api: Api, eventId: string | null) => {
  const [data, setData] = useState<RegistrationsResponse | null>(null);

  const reload = useCallback(async () => {
    if (!eventId) { setData(null); return; }
    try {
      const result = await api.registrations(eventId);
      if (result.ok) setData(result.body);
    } catch {
      // Sem conexão: mantém a última lista.
    }
  }, [api, eventId]);

  useEffect(() => {
    void reload();
    const timer = setInterval(() => { void reload(); }, POLL_MS);
    return () => { clearInterval(timer); };
  }, [reload]);

  return { data, reload };
};

export type Registrations = ReturnType<typeof useRegistrations>;


/** Tabela de inscritos para digitar no TOM (um a um): presença, lançado, cópia e inscrição à mão. Rola por dentro. */
export const RegistrationsTable = ({ api, event, registrations }: { api: Api; event: EventDto; registrations: Registrations }) => {
  const { data, reload } = registrations;
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<AccountResponse[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const run = async (act: () => Promise<{ ok: boolean; error?: { message: string } }>) => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await act();
      if (!result.ok) setMessage({ ok: false, text: result.error?.message ?? 'Erro inesperado.' });
      await reload();
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
    <tr key={r.accountId} class={`border-b border-line ${r.removed ? 'text-muted line-through' : ''}`}>
      <td class="whitespace-nowrap py-1.5 pr-2 tabular-nums">
        {r.removed ? r.playerId : <button type="button" class={action} title="Copiar Player ID" onClick={() => { copy(r.playerId); }}>{r.playerId}</button>}
      </td>
      <td class="py-1.5 pr-2">
        {r.removed ? r.name : <button type="button" class={`${action} text-left text-text`} title="Copiar nome" onClick={() => { copy(r.name); }}>{r.name}</button>}
        {!r.awaitingApproval && !r.removed && r.inRound === false && <div class="text-xs text-error">Não está nas guias da rodada atual</div>}
      </td>
      <td class="whitespace-nowrap py-1.5 pr-2">
        {r.removed ? 'Removido' : r.awaitingApproval && (
          <span class="flex gap-2">
            <button type="button" class={`${action} text-ok`} disabled={busy}
              onClick={() => { void run(() => api.registrationAction(event.id, r.accountId, 'approve')); }}>Aprovar</button>
            <button type="button" class={`${action} text-error`} disabled={busy}
              onClick={() => { if (confirm(`Recusar a entrada de ${r.name}?`)) void run(() => api.registrationAction(event.id, r.accountId, 'remove')); }}>Recusar</button>
          </span>
        )}
      </td>
      <td class="py-1.5 pr-2 text-center">
        {!r.removed && (
          <input type="checkbox" aria-label={`${r.name} lançado no TOM`} class="size-4 accent-accent" checked={r.launched} disabled={busy}
            onChange={(e) => { const on = e.currentTarget.checked; void run(() => api.setLaunched(event.id, r.accountId, on)); }} />
        )}
      </td>
      <td class="py-1.5 text-right">
        {!r.removed && !r.awaitingApproval && (
          <button type="button" class={`${action} text-error`} disabled={busy}
            onClick={() => { if (confirm(`Remover ${r.name} do evento?`)) void run(() => api.registrationAction(event.id, r.accountId, 'remove')); }}>Remover</button>
        )}
      </td>
    </tr>
  );

  return (
    <div class="flex min-h-0 flex-1 flex-col gap-3">
      <div class="min-h-0 flex-1 overflow-y-auto">
        {data?.registrations.length === 0 && <p class="m-0 text-sm text-muted">Ninguém inscrito ainda. O QR está na TV.</p>}
        {data && data.registrations.length > 0 && (
          <table class="w-full border-collapse text-sm">
            <thead class="sticky top-0 bg-panel">
              <tr class="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                <th class="whitespace-nowrap py-1.5 pr-2 font-semibold">Player ID</th><th class="py-1.5 pr-2 font-semibold">Nome</th>
                <th class="py-1.5 pr-2 font-semibold">Situação</th><th class="whitespace-nowrap py-1.5 pr-2 font-semibold">No TOM</th><th />
              </tr>
            </thead>
            <tbody>{data.registrations.map(row)}</tbody>
          </table>
        )}
      </div>
      <form class="m-0 flex gap-2" onSubmit={search}>
        <input class={input} aria-label="Inscrever à mão (nome ou Player ID)" placeholder="Inscrever à mão (nome ou Player ID)"
          required minLength={2} value={query} onInput={(e) => { setQuery(e.currentTarget.value); }} />
        <button type="submit" class={ghost} disabled={busy}>Buscar</button>
      </form>
      {found && (found.length === 0 ? <p class="m-0 text-sm text-muted">Nenhuma conta encontrada.</p> : (
        <ul class="m-0 flex max-h-32 flex-col gap-1 overflow-y-auto p-0 text-sm">
          {found.map((a) => (
            <li key={a.id} class="flex items-center justify-between gap-2">
              <span>{a.profile.name} · {a.playerId ?? 'sem Player ID'}</span>
              <button type="button" class={action} disabled={busy} onClick={() => { void run(() => api.addRegistration(event.id, a.id)); }}>Inscrever</button>
            </li>
          ))}
        </ul>
      ))}
      {message && <p class={`m-0 text-sm ${message.ok ? 'text-ok' : 'text-error'}`} role={message.ok ? 'status' : 'alert'}>{message.text}</p>}
    </div>
  );
};
