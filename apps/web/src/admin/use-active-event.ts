import type { EventDto } from '@tom/contracts';
import { useCallback, useEffect, useState } from 'preact/hooks';
import type { Api } from '../api.js';

/** A fase muda sozinha (rodada 1 iniciada, resultado final do TOM): a casca acompanha sem recarregar. */
const POLL_MS = 15_000;

/** Evento ativo do ADM: undefined carregando, null sem evento. */
export const useActiveEvent = (api: Api) => {
  const [event, setEvent] = useState<EventDto | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const result = await api.activeEvent();
      if (result.ok) { setEvent(result.body.event); setError(null); } else setError(result.error.message);
    } catch {
      // Sem conexão: mantém o último estado; a próxima consulta tenta de novo.
    }
  }, [api]);

  useEffect(() => {
    void reload();
    const timer = setInterval(() => { void reload(); }, POLL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') void reload(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [reload]);

  return { event, error, reload };
};
