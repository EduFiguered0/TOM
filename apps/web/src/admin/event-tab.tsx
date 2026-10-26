import type { EventDto } from '@tom/contracts';
import { useState } from 'preact/hooks';
import type { Api } from '../api.js';
import { EventConfig } from '../screens/event-panel.js';
import { RegistrationsTable, type Registrations } from '../screens/registrations.js';
import type { TomFolder } from '../tom-folder/use-tom-folder.js';
import { FolderBox } from './folder-box.js';
import { eventSteps } from './steps.js';
import { box, linkButton, ok, primary } from '../ui.js';

interface Props {
  api: Api;
  event: EventDto | null;
  reload: () => Promise<void>;
  folder: TomFolder;
  registrations: Registrations;
  /** Leva para a aba Equipe (marcar juízes). */
  onTeam: () => void;
}

const STEP = { done: 'text-green', now: 'bg-accent/15 font-bold text-accent', todo: 'text-muted' } as const;

/** Aba Evento: etapas do evento e, lado a lado, configuração, pasta do TOM e inscritos. Sem rolar a página. */
export const EventTab = ({ api, event, reload, folder, registrations, onTeam }: Props) => {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  /** Avança a fase do evento pela faixa de etapas. */
  const step = (action: 'close', question: string | null, done: string) => {
    if (!event || (question && !confirm(question))) return;
    setBusy(true);
    setMessage(null);
    void api.eventAction(event.id, action)
      .then(async (result) => { ok(result); setMessage({ ok: true, text: done }); await reload(); })
      .catch((e: unknown) => { setMessage({ ok: false, text: (e as Error).message }); })
      .finally(() => { setBusy(false); });
  };

  if (!event) {
    return (
      <section class={`${box} max-w-xl`} aria-label="Criar evento">
        <h2 class="m-0 text-base font-bold">Criar evento</h2>
        <EventConfig api={api} event={null} reload={reload} />
      </section>
    );
  }

  const steps = eventSteps(event.status);
  const data = registrations.data;
  return (
    <div class="flex min-h-0 flex-1 flex-col gap-4">
      <ol class="m-0 flex list-none overflow-hidden rounded-lg border border-line bg-panel p-0 text-sm">
        {steps.map((s, i) => (
          <li key={s.label} class={`flex flex-1 items-center gap-2 border-r border-line px-3 py-2 last:border-r-0 ${STEP[s.state]}`}
            aria-current={s.state === 'now' ? 'step' : undefined}>
            <span>{s.state === 'done' ? '✓' : s.state === 'now' ? '●' : '○'} {s.label}</span>
            {i === 3 && event.status === 'final' && (
              <button type="button" class={`${primary} ml-auto px-2 py-1 text-xs`} disabled={busy}
                onClick={() => { step('close', null, 'Evento encerrado.'); }}>
                Encerrar evento
              </button>
            )}
          </li>
        ))}
      </ol>
      {message && <p class={`m-0 text-sm ${message.ok ? 'text-ok' : 'text-error'}`} role={message.ok ? 'status' : 'alert'}>{message.text}</p>}
      {data && data.awaiting > 0 && (
        <p class="m-0 rounded-md border border-warn px-3 py-1.5 text-sm font-semibold text-warn" role="status">
          {data.awaiting} {data.awaiting === 1 ? 'entrada tardia aguardando' : 'entradas tardias aguardando'} aprovação: veja em Inscritos.
        </p>
      )}

      <div class="grid min-h-0 flex-1 grid-cols-[1fr_0.9fr_1.7fr] gap-4">
        <section class={box} aria-label="Configuração">
          <h2 class="m-0 text-sm font-bold">Configuração</h2>
          <EventConfig api={api} event={event} reload={reload} />
        </section>
        <section class={box} aria-label="Pasta do TOM e juízes">
          <h2 class="m-0 text-sm font-bold">Pasta do TOM</h2>
          <FolderBox folder={folder} />
          <h2 class="m-0 mt-2 text-sm font-bold">Juízes escalados</h2>
          <p class="m-0 text-sm text-muted">
            {event.judges.length === 0 ? 'Nenhum juiz no evento. ' : `${String(event.judges.length)} escalado(s) na Configuração. `}
            <button type="button" class={linkButton} onClick={onTeam}>Abrir a Equipe</button>
          </p>
        </section>
        <section class={box} aria-label="Inscritos">
          <h2 class="m-0 flex justify-between gap-2 text-sm font-bold">
            Inscritos
            {data && <span class="font-semibold text-muted">{data.total} inscritos · {data.launched} lançados no TOM</span>}
          </h2>
          <RegistrationsTable api={api} event={event} registrations={registrations} />
        </section>
      </div>
    </div>
  );
};
