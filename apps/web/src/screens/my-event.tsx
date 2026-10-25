import type { MyEventResponse } from '@tom/contracts';
import { useCallback, useEffect, useState } from 'preact/hooks';
import type { Api } from '../api.js';
import { bigPrimary, card, cardWarn, Feedback, subtitle } from '../ui.js';

/** Mesma cadência curta do celular: o aviso de confirmação aparece em até 15 s. */
const POLL_MS = 15_000;

/**
 * Evento do dia do jogador: aguardando início, "Confirme sua presença" quando o ADM pedir, ou inscrição removida.
 * Com o evento em andamento, some: a rodada (mesa e reporte) assume.
 */
export const MyEventCard = ({ api, refresh }: { api: Api; refresh: number }) => {
  const [mine, setMine] = useState<MyEventResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const confirm = () => {
    setBusy(true);
    setError(null);
    void api.confirmPresence()
      .then(async (result) => { if (result.ok) await load(); else setError(result.error.message); })
      .catch((e: unknown) => { setError((e as Error).message); })
      .finally(() => { setBusy(false); });
  };

  const event = mine?.event;
  const registration = mine?.registration;
  if (!event || !registration || event.status === 'running') return null;

  if (registration.removed) {
    return <section class={cardWarn}><h2 class={subtitle}>{event.label}</h2><p class="m-0 font-medium text-error">Sua inscrição foi removida, procure o ADM</p></section>;
  }
  if (event.status === 'confirming' && !registration.confirmed) {
    return (
      <section class={cardWarn}>
        <h2 class={subtitle}>Confirme sua presença</h2>
        <p class="m-0">{event.label}: o ADM pediu a confirmação de quem está na loja.</p>
        <button type="button" class={bigPrimary} disabled={busy} onClick={confirm}>{busy ? 'Confirmando…' : 'Confirmar presença'}</button>
        <Feedback message={error ? { ok: false, text: error } : null} />
      </section>
    );
  }
  return (
    <section class={card}>
      <h2 class={subtitle}>Evento do dia</h2>
      {event.status === 'confirming'
        ? <p class="m-0 font-medium text-ok">Presença confirmada. Aguarde o início da rodada.</p>
        : <p class="m-0">Inscrito no evento {event.label}, aguardando início.</p>}
    </section>
  );
};
