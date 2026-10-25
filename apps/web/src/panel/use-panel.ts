import type { PanelResponse } from '@tom/contracts';
import { useEffect, useState } from 'preact/hooks';
import type { Api } from '../api.js';

/** Poucos aparelhos da organização: 5 s mantém o termômetro em dia sem custo relevante. */
const POLL_MS = 5000;

/** Estado da aba Rodada: painel da rodada aberta, relógio local e a diferença para o relógio do servidor. */
export const usePanel = (api: Api) => {
  const [data, setData] = useState<PanelResponse | null>(null);
  const [skew, setSkew] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [offline, setOffline] = useState(false);
  // Rodada aberta: null = a atual (acompanha a próxima que o TOM publicar).
  const [selected, setSelected] = useState<number | null>(null);

  const accept = (panel: PanelResponse) => {
    setData(panel);
    setSkew(Date.parse(panel.serverTime) - Date.now());
  };

  useEffect(() => {
    let stopped = false;
    const load = async () => {
      try {
        const result = await api.panel(selected ?? undefined);
        if (stopped) return;
        setOffline(false);
        if (result.ok) accept(result.body);
      } catch {
        if (!stopped) setOffline(true);
      }
    };
    void load();
    const poll = setInterval(() => { void load(); }, POLL_MS);
    const tick = setInterval(() => { setNow(Date.now()); }, 1000);
    return () => { stopped = true; clearInterval(poll); clearInterval(tick); };
  }, [api, selected]);

  const latest = data?.latestRound ?? null;
  const open = (n: number) => { setData(null); setSelected(n === latest ? null : n); };
  /** Rodada mostrada é a atual (ações de início valem só nela). */
  const current = selected === null || selected === latest;

  return { data, offline, now, skew, selected, latest, current, open, accept };
};

export type Panel = ReturnType<typeof usePanel>;
