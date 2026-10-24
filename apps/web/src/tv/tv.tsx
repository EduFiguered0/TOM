import type { BoardResponse, TableColor } from '@tom/contracts';
import { useEffect, useState } from 'preact/hooks';
import { pages, roundClock } from './board.js';
import './tv.css';

/** 2 colunas de 10 (o CSS fixa 10 linhas). */
const PER_PAGE = 20;
const PAGE_MS = 15_000;

const LABEL: Record<TableColor, string> = {
  gray: 'Aguardando reporte',
  orange: 'Um lado reportou',
  green: 'Resultado validado',
  red: 'Juiz na mesa',
};

/** TV do salão: todos os pareamentos e o cronômetro, legíveis de longe. Pública e sem login. */
export const Tv = ({ board }: { board: BoardResponse }) => {
  const [now, setNow] = useState(Date.now());
  const [page, setPage] = useState(0);
  const skew = Date.parse(board.serverTime) - Date.now();
  const all = pages(board.tables, PER_PAGE);
  const current = all[page % all.length] ?? [];
  const clock = roundClock(board, now, skew);

  useEffect(() => {
    const tick = setInterval(() => { setNow(Date.now()); }, 1000);
    const flip = setInterval(() => { setPage((p) => p + 1); }, PAGE_MS);
    return () => { clearInterval(tick); clearInterval(flip); };
  }, []);

  return (
    <div class="tv">
      <header class="tv-head">
        <div>
          <div class="tv-event">{board.tournament}</div>
          <div class="tv-round">Rodada {board.round} · {board.division}</div>
        </div>
        <div class={`tv-clock ${clock.state}${clock.state === 'running' && clock.warning ? ' warning' : ''}`}>
          {clock.state === 'waiting' && 'Aguardando início'}
          {clock.state === 'running' && clock.text}
          {clock.state === 'over' && 'Tempo esgotado'}
        </div>
      </header>

      <ol class="tv-tables">
        {current.map((t) => (
          <li key={t.table} class={`tv-table ${t.color}`} title={LABEL[t.color]}>
            <span class="tv-number">{t.table}</span>
            <span class="tv-players"><span>{t.player1}</span><span class="tv-vs">x</span><span>{t.player2}</span></span>
            <span class="tv-dot" aria-label={LABEL[t.color]} />
          </li>
        ))}
      </ol>

      <footer class="tv-foot">
        <div class="tv-legend">
          {(Object.keys(LABEL) as TableColor[]).map((c) => <span key={c}><i class={`tv-dot ${c}`} />{LABEL[c]}</span>)}
        </div>
        {board.byes.length > 0 && <div>Bye: {board.byes.join(', ')}</div>}
        {all.length > 1 && <div>Página {(page % all.length) + 1} de {all.length}</div>}
      </footer>
    </div>
  );
};
