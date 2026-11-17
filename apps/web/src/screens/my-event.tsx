import type { MyEventResponse } from '@tom/contracts';
import { Trophy } from 'lucide-preact';
import { useCallback, useEffect, useState } from 'preact/hooks';
import type { Api } from '../api.js';
import { bigPrimary, card, cardWarn, Feedback, muted, subtitle } from '../ui.js';
import { myEventView } from './my-event-view.js';

/** Cadência curta do celular: a liberação da entrada tardia aparece em até 15 s. */
const POLL_MS = 15_000;

/**
 * Evento do dia do jogador: aguardando início, aguardando o organizador (entrada tardia), inscrição removida ou
 * resultado. Com o evento em andamento, some: a rodada (mesa e reporte) assume.
 */
export const MyEventCard = ({ api, refresh, onRejoined }: { api: Api; refresh: number; onRejoined?: () => void }) => {
  const [mine, setMine] = useState<MyEventResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await api.myEvent();
      if (result.ok) setMine(result.body);
    } catch {
      // Sem conexão: mantém o último estado; a próxima consulta tenta de novo.
    }
  }, [api]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => { void load(); }, POLL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') void load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [load, refresh]);

  /** Pede para voltar: entra aguardando o organizador aprovar. */
  const rejoin = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await api.rejoinEvent();
      if (!result.ok) { setMessage({ ok: false, text: result.error.message }); return; }
      setMine((m) => (m ? { ...m, registration: result.body.registration } : m));
      onRejoined?.();
    } catch (e) {
      setMessage({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const view = mine ? myEventView(mine) : 'none';
  const event = mine?.event;
  if (view === 'none' || !event) return null;

  if (view === 'removed') {
    return (
      <section class={cardWarn}>
        <h2 class={subtitle}>{event.label}</h2>
        <p class="m-0 font-medium text-error">Sua inscrição foi removida, procure o ADM</p>
        <button type="button" class={bigPrimary} disabled={busy} onClick={() => { void rejoin(); }}>
          {busy ? 'Enviando…' : 'Reingressar no evento'}
        </button>
        <Feedback message={message} />
      </section>
    );
  }
  if (view === 'awaiting') {
    return (
      <section class={cardWarn}>
        <h2 class={subtitle}>Aguardando o organizador</h2>
        <p class="m-0">Sua entrada no {event.label} foi pedida. O organizador vai liberar você para o próximo pareamento.</p>
      </section>
    );
  }
  const placement = mine.placement;
  if (view === 'placement' && placement) {
    const champion = placement.rank === 1;
    return (
      <section class={`${card} ${champion ? 'border-orange' : ''}`}>
        <h2 class={subtitle}>{event.label} · Resultado</h2>
        {champion && <p class="m-0 flex items-center gap-2 text-2xl font-extrabold text-orange"><Trophy size={28} aria-hidden="true" />Você venceu o torneio!</p>}
        <p class="m-0 text-lg">Você ficou em <b>{placement.rank}º</b> de {placement.total}.</p>
        <p class={muted}>
          {placement.wins}-{placement.losses}-{placement.ties}{placement.points === null ? '' : ` · ${String(placement.points)} pontos`}
        </p>
      </section>
    );
  }
  if (view === 'ended') {
    return <section class={card}><h2 class={subtitle}>{event.label}</h2><p class="m-0">Evento encerrado. A classificação está na TV.</p></section>;
  }
  return (
    <section class={card}>
      <h2 class={subtitle}>Evento do dia</h2>
      <p class="m-0">Inscrito no evento {event.label}, aguardando início.</p>
    </section>
  );
};
