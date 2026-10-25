import type { AccountResponse, EventDto } from '@tom/contracts';
import { useEffect, useState } from 'preact/hooks';
import type { Api } from '../api.js';
import { field, ghost, ok, primary } from '../ui.js';

const today = () => new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);

const label = 'flex flex-col gap-1 text-xs text-muted';

/** Caixas dos juízes da equipe: na criação e na edição do evento. */
const JudgesField = ({ team, chosen, onChange }: { team: AccountResponse[]; chosen: string[]; onChange: (ids: string[]) => void }) => (
  <fieldset class="m-0 flex flex-col gap-1 border-0 p-0">
    <legend class="mb-1 text-xs text-muted">Juízes escalados</legend>
    {team.length === 0
      ? <p class="m-0 text-sm text-muted">Nenhum juiz na equipe. Marque na aba Equipe.</p>
      : team.map((j) => (
        <label class="flex items-center gap-2 text-sm text-text" key={j.id}>
          <input type="checkbox" class="size-4 accent-accent" checked={chosen.includes(j.id)}
            onChange={(e) => { onChange(e.currentTarget.checked ? [...chosen, j.id] : chosen.filter((x) => x !== j.id)); }} />
          {j.profile.name}
        </label>
      ))}
  </fieldset>
);

interface Props {
  api: Api;
  /** null: sem evento ativo (mostra "Criar evento"). */
  event: EventDto | null;
  reload: () => Promise<void>;
}

/** Bloco Configuração da aba Evento: cria o evento, ou edita tempo e juízes e cancela. */
export const EventConfig = ({ api, event, reload }: Props) => {
  const [team, setTeam] = useState<AccountResponse[]>([]);
  const [name, setName] = useState('');
  const [date, setDate] = useState(today());
  const [minutes, setMinutes] = useState('30');
  const [chosen, setChosen] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => { void api.judges().then((r) => { if (r.ok) setTeam(r.body); }).catch(() => undefined); }, [api]);
  // Outro evento (ou o primeiro carregamento): o formulário mostra o que está salvo.
  useEffect(() => { if (event) { setMinutes(String(event.roundMinutes)); setChosen(event.judges); } }, [event?.id]);

  const run = async (action: () => Promise<string | null>) => {
    setBusy(true);
    setMessage(null);
    try {
      const done = await action();
      if (done) setMessage({ ok: true, text: done });
      await reload();
    } catch (e) {
      setMessage({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const create = (e: Event) => {
    e.preventDefault();
    void run(async () => {
      ok(await api.createEvent({ label: name.trim(), date, roundMinutes: Number(minutes), judges: chosen }));
      setName('');
      return 'Evento criado. Conecte a pasta do TOM.';
    });
  };

  const cancel = () => {
    if (event && confirm(`Cancelar o evento ${event.label}? Ele não entra no histórico.`)) {
      void run(async () => { ok(await api.eventAction(event.id, 'cancel')); return 'Evento cancelado.'; });
    }
  };

  const feedback = message && <p class={`m-0 text-sm ${message.ok ? 'text-ok' : 'text-error'}`} role={message.ok ? 'status' : 'alert'}>{message.text}</p>;

  if (!event) {
    return (
      <form class="m-0 flex flex-col gap-3" onSubmit={create}>
        <label class={label}>Nome do evento
          <input class={field} required minLength={2} value={name} onInput={(e) => { setName(e.currentTarget.value); }} />
        </label>
        <div class="grid grid-cols-2 gap-3">
          <label class={label}>Data<input class={field} type="date" required value={date} onInput={(e) => { setDate(e.currentTarget.value); }} /></label>
          <label class={label}>Tempo de rodada (min)
            <input class={field} inputmode="numeric" required value={minutes} onInput={(e) => { setMinutes(e.currentTarget.value); }} />
          </label>
        </div>
        <JudgesField team={team} chosen={chosen} onChange={setChosen} />
        <button type="submit" class={`${primary} self-start`} disabled={busy}>Criar evento</button>
        {feedback}
      </form>
    );
  }

  return (
    <div class="flex flex-col gap-3">
      <div class="grid grid-cols-2 gap-3">
        <div class={label}>Nome do evento<span class="text-sm text-text">{event.label}</span></div>
        <div class={label}>Data<span class="text-sm text-text">{event.date.split('-').reverse().join('/')}</span></div>
      </div>
      <label class={label}>Tempo de rodada (minutos)
        <input class={field} inputmode="numeric" value={minutes} onInput={(e) => { setMinutes(e.currentTarget.value); }} />
      </label>
      <JudgesField team={team} chosen={chosen} onChange={setChosen} />
      <div class="flex items-center gap-2">
        <button type="button" class={primary} disabled={busy}
          onClick={() => { void run(async () => { ok(await api.updateEvent(event.id, { roundMinutes: Number(minutes), judges: chosen })); return 'Evento salvo.'; }); }}>
          Salvar
        </button>
        <div class="flex-1" />
        <button type="button" class={`${ghost} text-error`} disabled={busy} onClick={cancel}>Cancelar evento</button>
      </div>
      {feedback}
    </div>
  );
};
