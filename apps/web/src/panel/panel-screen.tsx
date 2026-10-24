import type { MeResponse, PanelResponse } from '@tom/contracts';
import { useEffect, useState } from 'preact/hooks';
import type { Api } from '../api.js';
import { StartRoundCard } from '../round/start-card.js';
import { roundClock } from '../tv/board.js';
import { sortForAction } from './panel.js';
import { TableRow } from './table-row.js';
import './panel.css';

/** Poucos aparelhos da organização: 5 s mantém o termômetro em dia sem custo relevante. */
const POLL_MS = 5000;

/** Painel do ADM e do juiz: termômetro de todas as mesas, override, acréscimo, keys e reporte por jogador. */
export const PanelScreen = ({ api, me }: { api: Api; me: MeResponse }) => {
  const [data, setData] = useState<PanelResponse | null>(null);
  const [skew, setSkew] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [offline, setOffline] = useState(false);
  const admin = me.role === 'admin';

  const accept = (panel: PanelResponse) => {
    setData(panel);
    setSkew(Date.parse(panel.serverTime) - Date.now());
  };

  useEffect(() => {
    let stopped = false;
    const load = async () => {
      try {
        const result = await api.panel();
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
  }, [api]);

  const round = data?.round;
  const endsAt = round?.startedAt && round.roundMinutes ? new Date(Date.parse(round.startedAt) + round.roundMinutes * 60_000).toISOString() : null;
  const clock = roundClock({ endsAt }, now, skew);

  return (
    <div class="panel">
      <header class="panel-head">
        <a href="/conta" class="link">← Início</a>
        <h1>Painel {admin ? 'do ADM' : 'do juiz'}</h1>
        {offline && <span class="error">Sem conexão · dados podem estar desatualizados</span>}
      </header>

      {!data && <p class="muted">Carregando…</p>}
      {data && !round && <p class="muted">Nenhuma rodada publicada pelo TOM ainda.</p>}
      {round && (
        <>
          <section class="card panel-summary">
            <div>
              <div class="muted">{round.tournament} · {round.division}</div>
              <div class="panel-round">Rodada {round.round}{round.bestOf ? ` · melhor de ${String(round.bestOf)}` : ''}</div>
            </div>
            <div class="panel-counts">
              <span class="chip red">{round.counts.red} vermelhas</span>
              <span class="chip orange">{round.counts.orange} laranja</span>
              <span class="chip gray">{round.counts.gray} cinza</span>
              <span class="chip green">{round.counts.green} verdes</span>
            </div>
            <div class={`panel-clock ${clock.state}${clock.state === 'running' && clock.warning ? ' warn' : ''}`}>
              {clock.state === 'running' ? clock.text : clock.state === 'over' ? 'Tempo esgotado' : 'Não iniciada'}
            </div>
          </section>
          {round.closed && <p class="notice ok">Todas as keys lançadas: a próxima rodada já pode ser gerada no TOM.</p>}
          {!round.closed && round.allGreen && <p class="notice ok">Todas as mesas verdes: lance as keys no TOM e marque cada uma.</p>}
          {admin && !round.startedAt && <StartRoundCard api={api} />}

          <div class="panel-tables">
            {sortForAction(round.tables).map((t) => (
              <TableRow key={t.table} api={api} table={t} admin={admin} started={round.startedAt !== null}
                bestOf={round.bestOf} now={now} skew={skew} onUpdate={accept} />
            ))}
          </div>
          {round.byes.length > 0 && <p class="muted">Bye: {round.byes.join(', ')}</p>}
        </>
      )}
    </div>
  );
};
