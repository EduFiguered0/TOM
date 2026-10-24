import type { AccountResponse, EventDto, EventStatusDto } from '@tom/contracts';
import { useCallback, useEffect, useState } from 'preact/hooks';
import type { Api } from '../api.js';
import { RegistrationsCard } from './registrations.js';

const STATUS: Record<EventStatusDto, string> = {
  open: 'Inscrições abertas',
  confirming: 'Confirmando presença',
  running: 'Em andamento',
  final: 'Resultado final recebido',
  closed: 'Encerrado',
  cancelled: 'Cancelado',
};

const POLL_MS = 15_000;

const today = () => new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);

/** Caixas dos juízes da equipe: na criação e na edição do evento. */
const JudgesField = ({ team, chosen, onChange }: { team: AccountResponse[]; chosen: string[]; onChange: (ids: string[]) => void }) => (
  <fieldset class="judges">
    <legend>Juízes escalados</legend>
    {team.length === 0
      ? <p class="muted">Nenhum juiz na equipe. Marque na Equipe.</p>
      : team.map((j) => (
        <label class="check" key={j.id}>
          <input
            type="checkbox"
            checked={chosen.includes(j.id)}
            onChange={(e) => { onChange(e.currentTarget.checked ? [...chosen, j.id] : chosen.filter((x) => x !== j.id)); }}
          />
          {j.profile.name}
        </label>
      ))}
  </fieldset>
);

/** Evento do dia do ADM: cria, conduz as fases (confirmação, encerrar, cancelar), edita tempo e juízes. */
export const EventPanel = ({ api }: { api: Api }) => {
  const [active, setActive] = useState<EventDto | null | undefined>(undefined);
  const [team, setTeam] = useState<AccountResponse[]>([]);
  const [command, setCommand] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [date, setDate] = useState(today());
  const [minutes, setMinutes] = useState('30');
  const [chosen, setChosen] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const [event, judges] = await Promise.all([api.activeEvent(), api.judges()]);
    if (judges.ok) setTeam(judges.body);
    if (event.ok) {
      setActive(event.body.event);
      if (event.body.event) { setMinutes(String(event.body.event.roundMinutes)); setChosen(event.body.event.judges); }
    } else {
      setMessage({ ok: false, text: event.error.message });
    }
  }, [api]);

  useEffect(() => {
    void load().catch((e: unknown) => { setMessage({ ok: false, text: (e as Error).message }); });
    // A fase muda sozinha (rodada 1 iniciada, resultado final do TOM): "Encerrar" aparece sem recarregar.
    const timer = setInterval(() => { void refreshStatus(); }, POLL_MS);
    return () => { clearInterval(timer); };
  }, [load]);

  /** Só o status: não apaga o que o ADM está digitando no tempo de rodada e nos juízes. */
  const refreshStatus = async () => {
    try {
      const result = await api.activeEvent();
      if (result.ok) setActive((now) => (now && result.body.event?.id === now.id ? { ...now, status: result.body.event.status } : result.body.event));
    } catch {
      // Sem conexão: a próxima volta tenta de novo.
    }
  };

  const run = async (action: () => Promise<string | null>) => {
    setBusy(true);
    setMessage(null);
    try {
      const done = await action();
      if (done) setMessage({ ok: true, text: done });
      await load();
    } catch (e) {
      setMessage({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  /** Resultado da API: erro vira exceção com a mensagem dela. */
  const ok = <T,>(result: { ok: true; body: T } | { ok: false; error: { message: string } }): T => {
    if (!result.ok) throw new Error(result.error.message);
    return result.body;
  };

  const create = (e: Event) => {
    e.preventDefault();
    void run(async () => {
      const created = ok(await api.createEvent({ label: label.trim(), date, roundMinutes: Number(minutes), judges: chosen }));
      setCommand(`$env:TOM_UPLOAD_TOKEN="${created.token}"; npm run uploader -- --folder "<pasta de relatórios do TOM>" --api ${location.origin}/api`);
      setLabel('');
      return null;
    });
  };

  const save = () => {
    if (active) void run(async () => { ok(await api.updateEvent(active.id, { roundMinutes: Number(minutes), judges: chosen })); return 'Evento salvo.'; });
  };

  const step = (action: 'confirmation' | 'close' | 'cancel', question: string | null, done: string) => {
    if (!active || (question && !confirm(question))) return;
    void run(async () => { ok(await api.eventAction(active.id, action)); return done; });
  };

  const copy = (text: string) => {
    void navigator.clipboard.writeText(text).then(
      () => { setMessage({ ok: true, text: 'Comando copiado.' }); },
      () => { setMessage({ ok: false, text: 'Não foi possível copiar; selecione e copie manualmente.' }); },
    );
  };

  return (
    <>
      <section class="card">
        <h2>Evento do dia</h2>
        {active === undefined && <p class="muted">Carregando…</p>}
        {active === null && (
          <form onSubmit={create}>
            <label for="event-label">Nome do evento</label>
            <input id="event-label" required minLength={2} value={label} onInput={(e) => { setLabel(e.currentTarget.value); }} />
            <label for="event-date">Data</label>
            <input id="event-date" type="date" required value={date} onInput={(e) => { setDate(e.currentTarget.value); }} />
            <label for="event-minutes">Tempo de rodada (minutos)</label>
            <input id="event-minutes" inputmode="numeric" required value={minutes} onInput={(e) => { setMinutes(e.currentTarget.value); }} />
            <JudgesField team={team} chosen={chosen} onChange={setChosen} />
            <button type="submit" disabled={busy}>Criar evento</button>
          </form>
        )}
        {active && (
          <div>
            <p><b>{active.label}</b> · {active.date.split('-').reverse().join('/')}</p>
            <p class="muted">{STATUS[active.status]}</p>
            <a class="link" href="/tv" target="_blank" rel="noopener">Abrir a TV</a>
            {active.status === 'open' && (
              <button type="button" disabled={busy} onClick={() => { step('confirmation', 'Pedir confirmação fecha o QR. Continuar?', 'Confirmação pedida: o QR fechou.'); }}>
                Pedir confirmação
              </button>
            )}
            {active.status === 'final' && (
              <button type="button" disabled={busy} onClick={() => { step('close', null, 'Evento encerrado.'); }}>Encerrar evento</button>
            )}
            <label for="edit-minutes">Tempo de rodada (minutos)</label>
            <input id="edit-minutes" inputmode="numeric" value={minutes} onInput={(e) => { setMinutes(e.currentTarget.value); }} />
            <JudgesField team={team} chosen={chosen} onChange={setChosen} />
            <button type="button" disabled={busy} onClick={save}>Salvar</button>
            <button
              type="button"
              class="link"
              disabled={busy}
              onClick={() => { step('cancel', `Cancelar o evento ${active.label}? Ele não entra no histórico.`, 'Evento cancelado.'); }}
            >
              Cancelar evento
            </button>
          </div>
        )}
        {command && (
          <div>
            <p class="muted">Copie agora: o token do enviador não aparece de novo. No notebook do TOM, no PowerShell:</p>
            <p class="code">{command}</p>
            <button type="button" onClick={() => { copy(command); }}>Copiar comando</button>
          </div>
        )}
        {message && <p class={message.ok ? 'ok' : 'error'} role={message.ok ? 'status' : 'alert'}>{message.text}</p>}
      </section>
      {active && <RegistrationsCard api={api} event={active} />}
    </>
  );
};
