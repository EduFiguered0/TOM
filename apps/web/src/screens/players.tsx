import type { PlayerDetailDto, PlayerEventDto, PlayerRowDto } from '@tom/contracts';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Api } from '../api.js';
import { Avatar } from '../photo/avatar.js';
import { createPhotoCache } from '../photo/photo-cache.js';
import { box, Feedback, field, ghost } from '../ui.js';
import { PlayerEditor } from './player-edit.js';

const cell = 'py-1.5 pr-3';

/**
 * Guia Jogadores: todos os cadastrados, com busca por Player ID, nome ou e-mail. Os dados chegam mascarados do
 * servidor. Ao abrir um jogador: eventos com pagamento, "Editar" (correção do ADM) e "Desfazer vínculo".
 */
export const PlayersTab = ({ api }: { api: Api }) => {
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<PlayerRowDto[] | null>(null);
  const [open, setOpen] = useState<PlayerRowDto | null>(null);
  const [events, setEvents] = useState<PlayerEventDto[] | null>(null);
  const [busy, setBusy] = useState(false);
  /** Dados completos do jogador aberto, só enquanto o ADM edita. */
  const [editing, setEditing] = useState<PlayerDetailDto | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  /** Jogador aberto agora: resposta de um clique anterior que chegue atrasada é descartada. */
  const selected = useRef<string | null>(null);

  const search = async (text: string, keepMessage = false) => {
    setBusy(true);
    if (!keepMessage) setMessage(null);
    try {
      const result = await api.players(text.trim());
      if (result.ok) setRows(result.body); else setMessage({ ok: false, text: result.error.message });
    } catch (e) {
      setMessage({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => { void search(''); }, [api]);

  const select = (row: PlayerRowDto) => {
    selected.current = row.id;
    setOpen(row);
    setEditing(null);
    setEvents(null);
    void api.playerEvents(row.id)
      .then((result) => {
        if (selected.current !== row.id) return;
        if (result.ok) setEvents(result.body); else setMessage({ ok: false, text: result.error.message });
      })
      .catch((e: unknown) => { setMessage({ ok: false, text: (e as Error).message }); });
  };

  const photos = useMemo(() => createPhotoCache(async (id) => { const r = await api.photo(id); return r.ok ? r.body.photo : null; }), [api]);

  /** Foto inadequada: o ADM tira. */
  const removePhoto = () => {
    if (!open || !confirm(`Remover a foto de ${open.firstName}?`)) return;
    setBusy(true);
    setMessage(null);
    void api.removePlayerPhoto(open.id)
      .then((result) => {
        if (!result.ok) { setMessage({ ok: false, text: result.error.message }); return; }
        setOpen(result.body);
        setRows((list) => list?.map((r) => (r.id === result.body.id ? result.body : r)) ?? null);
        setMessage({ ok: true, text: 'Foto removida.' });
      })
      .catch((e: unknown) => { setMessage({ ok: false, text: (e as Error).message }); })
      .finally(() => { setBusy(false); });
  };

  const edit = () => {
    if (!open) return;
    setBusy(true);
    setMessage(null);
    void api.playerDetail(open.id)
      .then((result) => { if (result.ok) setEditing(result.body); else setMessage({ ok: false, text: result.error.message }); })
      .catch((e: unknown) => { setMessage({ ok: false, text: (e as Error).message }); })
      .finally(() => { setBusy(false); });
  };

  const saved = (player: PlayerDetailDto) => {
    setEditing(null);
    setOpen(player);
    setMessage({ ok: true, text: 'Dados salvos. O jogador verá um aviso ao entrar.' });
    void search(query, true);
  };

  const unlink = () => {
    const pid = open?.playerId;
    if (!open || !pid) return;
    if (!confirm(`Tirar o Player ID ${pid} de ${open.firstName}? A pessoa precisará informar outro Player ID.`)) return;
    setBusy(true);
    setMessage(null);
    void api.unlinkPlayerId(pid)
      .then(async (result) => {
        if (!result.ok) { setMessage({ ok: false, text: result.error.message }); return; }
        setOpen(result.body);
        setMessage({ ok: true, text: 'Vínculo desfeito. O dono do Player ID já pode cadastrá-lo.' });
        await search(query, true);
      })
      .catch((e: unknown) => { setMessage({ ok: false, text: (e as Error).message }); })
      .finally(() => { setBusy(false); });
  };

  return (
    <div class="grid min-h-0 flex-1 grid-cols-[1.4fr_1fr] gap-4">
      <section class={`${box} min-h-0`} aria-label="Jogadores cadastrados">
        <form class="m-0 flex gap-2" onSubmit={(e) => { e.preventDefault(); void search(query); }}>
          <input class={field} aria-label="Buscar por Player ID, nome ou e-mail" placeholder="Player ID, nome ou e-mail" value={query}
            onInput={(e) => { setQuery(e.currentTarget.value); }} />
          <button type="submit" class={ghost} disabled={busy}>Buscar</button>
        </form>
        <div class="min-h-0 flex-1 overflow-y-auto">
          {rows?.length === 0 && <p class="m-0 text-sm text-muted">Ninguém encontrado.</p>}
          {rows && rows.length > 0 && (
            <table class="w-full border-collapse text-sm">
              <thead class="sticky top-0 bg-panel">
                <tr class="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                  <th class={`${cell} font-semibold`}>Player ID</th><th class={`${cell} font-semibold`}>Nome</th>
                  <th class={`${cell} font-semibold`}>E-mail</th><th class={`${cell} font-semibold`}>Telefone</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} class={`cursor-pointer border-b border-line hover:bg-accent/10 ${open?.id === r.id ? 'bg-accent/15' : ''}`}
                    onClick={() => { select(r); }}>
                    <td class={`${cell} tabular-nums`}>{r.playerId ?? <span class="text-muted">sem Player ID</span>}</td>
                    <td class={cell}>{r.firstName}</td>
                    <td class={cell}>{r.email}</td>
                    <td class={`${cell} tabular-nums`}>{r.phone ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section class={box} aria-label="Jogador escolhido">
        {!open && <p class="m-0 text-sm text-muted">Escolha um jogador na lista.</p>}
        {open && (
          <>
            <div class="flex items-center gap-3">
              <Avatar photo={open.photo} name={open.firstName} cache={photos} class="size-14 text-[2rem]" />
              <h2 class="m-0 text-base font-bold">{open.firstName}</h2>
            </div>
            {open.photo && (
              <button type="button" class={`${ghost} self-start text-error`} disabled={busy} onClick={removePhoto}>Remover foto</button>
            )}
            <p class="m-0 text-sm text-muted">{open.playerId ?? 'sem Player ID'} · {open.email}{open.phone ? ` · ${open.phone}` : ''}</p>
            {editing
              ? <PlayerEditor player={editing} api={api} onSaved={saved} onCancel={() => { setEditing(null); }} />
              : <button type="button" class={`${ghost} self-start`} disabled={busy} onClick={edit}>Editar dados</button>}
            <h3 class="m-0 mt-2 text-sm font-bold">Eventos</h3>
            {events === null && <p class="m-0 text-sm text-muted">Carregando…</p>}
            {events?.length === 0 && <p class="m-0 text-sm text-muted">Nenhum evento registrado.</p>}
            {events && events.length > 0 && (
              <ul class="m-0 flex list-none flex-col gap-1 p-0 text-sm">
                {events.map((ev) => (
                  <li key={ev.eventId} class="flex justify-between gap-3 border-b border-line py-1">
                    <span>{ev.label} <span class="text-muted">({ev.date.split('-').reverse().join('/')})</span></span>
                    <span class={ev.paid ? 'text-ok' : 'text-warn'}>{ev.paid ? 'Pago' : 'Não pago'}</span>
                  </li>
                ))}
              </ul>
            )}
            {open.playerId && (
              <button type="button" class={`${ghost} mt-2 self-start text-error`} disabled={busy} onClick={unlink}>Desfazer vínculo do Player ID</button>
            )}
          </>
        )}
        <Feedback message={message} />
      </section>
    </div>
  );
};
