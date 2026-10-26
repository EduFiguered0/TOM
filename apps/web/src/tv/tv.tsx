import type { RoundBoard, TableColor } from '@tom/contracts';
import { useEffect, useState } from 'preact/hooks';
import { joinUrl, pages, roundClock } from './board.js';
import { Qr } from './qr.js';
import { DOT, EDGE, eventTitle, screen, tile } from './styles.js';

/** 2 colunas de 10 (a grade fixa 10 linhas). */
const PER_PAGE = 20;
const PAGE_MS = 15_000;

const LABEL: Record<TableColor, string> = {
  gray: 'Aguardando reporte',
  orange: 'Um lado reportou',
  green: 'Resultado validado',
  red: 'Juiz na mesa',
};

const CLOCK = {
  waiting: 'text-[2vw] text-muted',
  running: 'text-[5vw]',
  warning: 'text-[5vw] text-orange',
  over: 'text-[2.6vw] text-red',
} as const;

/** TV do salão: todos os pareamentos e o cronômetro, legíveis de longe, e o QR para quem chega tarde. */
export const Tv = ({ board }: { board: RoundBoard & { code?: string } }) => {
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
    <div class={screen}>
      <header class="flex items-center justify-between gap-[2vw]">
        <div>
          <div class={eventTitle}>{board.tournament}</div>
          <div class="text-[1.6vw] text-muted">Rodada {board.round} · {board.division}</div>
        </div>
        <div class={`font-extrabold tracking-wider tabular-nums ${CLOCK[clock.state === 'running' && clock.warning ? 'warning' : clock.state]}`}>
          {clock.state === 'waiting' && 'Aguardando início'}
          {clock.state === 'running' && clock.text}
          {clock.state === 'over' && 'Tempo esgotado'}
        </div>
      </header>

      {/* Numeração descendo a coluna (1–10 à esquerda, 11–20 à direita): é assim que se procura a mesa. */}
      <ol class="m-0 grid min-h-0 flex-1 list-none grid-flow-col grid-cols-2 grid-rows-[repeat(10,minmax(0,1fr))] gap-x-[1.5vw] gap-y-[1vh] p-0">
        {current.map((t) => (
          <li key={t.table} class={`${tile} border-l-[.5vw] ${EDGE[t.color]}`} title={LABEL[t.color]}>
            <span class="w-[3.6vw] text-right text-[2.2vw] font-extrabold tabular-nums">{t.table}</span>
            <span class="flex min-w-0 flex-1 items-baseline gap-[.8vw] text-[1.55vw]">
              <span class="flex-1 truncate">{t.player1}</span>
              <span class="text-[1.1vw] text-muted">x</span>
              <span class="flex-1 truncate">{t.player2}</span>
            </span>
            <span class={`size-[1.1vw] shrink-0 rounded-full ${DOT[t.color]}`} aria-label={LABEL[t.color]} />
          </li>
        ))}
      </ol>

      <footer class="flex items-end justify-between gap-[2vw] text-[1.2vw] text-muted">
        <div class="flex gap-[1.6vw]">
          {(Object.keys(LABEL) as TableColor[]).map((c) => (
            <span key={c} class="inline-flex items-center gap-[.5vw]"><i class={`size-[.9vw] rounded-full ${DOT[c]}`} />{LABEL[c]}</span>
          ))}
        </div>
        {board.byes.length > 0 && <div>Bye: {board.byes.join(', ')}</div>}
        {all.length > 1 && <div>Página {(page % all.length) + 1} de {all.length}</div>}
        {board.code && (
          <div class="flex items-center gap-[.8vw] text-right">
            <span>Chegou agora?<br />Escaneie para entrar</span>
            <Qr url={joinUrl(location.origin, board.code)} class="h-[9vw]" />
          </div>
        )}
      </footer>
    </div>
  );
};
