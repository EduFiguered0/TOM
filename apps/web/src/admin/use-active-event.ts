import type { EventDto } from '@tom/contracts';
import { useCallback, useEffect, useState } from 'preact/hooks';
import type { Api } from '../api.js';

/** A fase muda sozinha (rodada 1 iniciada, resultado final do TOM): a casca acompanha sem recarregar. */
const POLL_MS = 15_000;

/** Evento ativo do ADM: undefined carregando, null sem evento. Desligado (juiz), não consulta e fica null. */
export const useActiveEvent = (api: Api, enabled: boolean) => {
  const [event, setEvent] = useState<EventDto | null | undefined>(enabled ? undefined : null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!enabled) return;
    try {
      const result = await api.activeEvent();
      if (result.ok) { setEvent(result.body.event); setError(null); } else setError(result.error.message);
    } catch {
      // Sem conexão: mantém o último estado; a próxima consulta tenta de novo.
    }
  }, [api, enabled]);

  useEffect(() => {
    if (!enabled) return;
    void reload();
    const timer = setInterval(() => { void reload(); }, POLL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') void reload(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [reload]);

  return { event, error, reload };
};
