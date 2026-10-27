import type { RoundBoard, TableColor } from '@tom/contracts';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { clockSkew, joinUrl, pages, roundClock, tvColumns } from './board.js';
import { Avatar } from '../photo/avatar.js';
import type { PhotoCache } from '../photo/photo-cache.js';
import { Qr } from './qr.js';
import { DOT, EDGE, eventTitle, screen, tile } from './styles.js';

const PAGE_MS = 15_000;

/** QR no canto da TV para quem chega depois da rodada 1. */
export const LateJoin = ({ code }: { code: string }) => (
  <div class="mt-auto flex flex-col items-center gap-[.8vh] text-center text-[1vw] text-muted">
    <Qr url={joinUrl(location.origin, code)} class="h-[11vw]" />
    <span>Chegou agora?<br />Escaneie para entrar</span>
  </div>
);

type Table = RoundBoard['tables'][number];

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

/** Letra conforme o número de colunas: tudo numa página, legível de longe. */
const SIZE = {
  1: { name: 'text-[1.9vw]', number: 'text-[2.4vw] w-[3.6vw]' },
  2: { name: 'text-[1.45vw]', number: 'text-[1.9vw] w-[3vw]' },
  3: { name: 'text-[1.05vw]', number: 'text-[1.4vw] w-[2.4vw]' },
} as const;

const WIN = 'font-bold text-green';
const LOSE = 'text-muted line-through';

/** Vencedor em destaque, perdedor riscado; empate com "=" no lugar do "x"; derrota dupla com os dois riscados. */
const sides = (result: Table['result']): [string, string] => {
  switch (result) {
    case 'player1': return [WIN, LOSE];
    case 'player2': return [LOSE, WIN];
    case 'double_loss': return [LOSE, LOSE];
    default: return ['', ''];
  }
};

/** TV do salão: todas as mesas numa página, em ordem, com o vencedor de cada uma; byes e o QR para quem chega tarde. */
export const Tv = ({ board, receivedAt, photos = null }: { board: RoundBoard & { code?: string }; receivedAt?: number; photos?: PhotoCache | null }) => {
  const [now, setNow] = useState(Date.now());
  const [page, setPage] = useState(0);
  // Medida uma vez por resposta (não a cada segundo): senão o cronômetro congela entre as consultas.
  const skew = useMemo(() => clockSkew(board.serverTime, receivedAt ?? Date.now()), [board.serverTime, receivedAt]);
  const layout = tvColumns(board.tables.length);
  const all = pages(board.tables, Math.max(1, layout.perPage));
  const current = all[page % all.length] ?? [];
  const rows = layout.columns === 1 ? Math.min(layout.perColumn, Math.max(current.length, 8)) : layout.perColumn;
  const size = SIZE[layout.columns];
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

      <div class="grid min-h-0 flex-1 grid-cols-[1fr_17vw] gap-[1.5vw]">
        {/* Numeração descendo cada coluna (1–15, depois 16–30…): é assim que se procura a mesa. */}
        <ol class="m-0 grid min-h-0 list-none grid-flow-col gap-x-[1.2vw] gap-y-[.8vh] p-0"
          style={{ gridTemplateColumns: `repeat(${String(layout.columns)}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${String(rows)}, minmax(0, 1fr))` }}>
          {current.map((t) => {
            const [one, two] = sides(t.result);
            return (
              <li key={t.table} class={`${tile} border-l-[.5vw] ${EDGE[t.color]}`} title={LABEL[t.color]}>
                <span class={`text-right font-extrabold leading-none tabular-nums ${size.number}`}>{t.table}</span>
                {layout.columns === 3
                  ? (
                    // Três colunas: um jogador por linha, para o nome inteiro caber.
                    <span class={`flex min-w-0 flex-1 flex-col justify-center gap-[.3vh] leading-none ${size.name}`}>
                      <span class={`flex min-w-0 items-center gap-[.4vw] ${one}`}>
                        <Avatar photo={t.photo1} name={t.player1} cache={photos} class="size-[1.4vw] text-[1.4vw]" /><span class="truncate">{t.player1}</span>
                      </span>
                      <span class={`flex min-w-0 items-center gap-[.4vw] ${two}`}>
                        <Avatar photo={t.photo2} name={t.player2} cache={photos} class="size-[1.4vw] text-[1.4vw]" />
                        <span class="truncate">{t.result === 'tie' ? <b class="text-orange">= </b> : null}{t.player2}</span>
                      </span>
                    </span>
                  )
                  : (
                    <span class={`flex min-w-0 flex-1 items-baseline gap-[.8vw] leading-none ${size.name}`}>
                      <Avatar photo={t.photo1} name={t.player1} cache={photos} class="size-[1.15em] text-[1.15em]" />
                      <span class={`flex-1 truncate ${one}`}>{t.player1}</span>
                      <span class={`text-[.8em] ${t.result === 'tie' ? 'font-bold text-orange' : 'text-muted'}`}>{t.result === 'tie' ? '=' : 'x'}</span>
                      <span class={`flex-1 truncate text-right ${two}`}>{t.player2}</span>
                      <Avatar photo={t.photo2} name={t.player2} cache={photos} class="size-[1.15em] text-[1.15em]" />
                    </span>
                  )}
                <span class={`size-[1vw] shrink-0 rounded-full ${DOT[t.color]}`} aria-label={LABEL[t.color]} />
              </li>
            );
          })}
        </ol>

        <aside class="flex min-h-0 flex-col justify-between gap-[2vh]">
          {board.byes.length > 0 && (
            <section class="rounded-[.8vw] border border-line bg-panel p-[1vw]">
              <h2 class="m-0 mb-[.6vh] text-[1vw] font-bold uppercase tracking-wide text-accent">Bye nesta rodada</h2>
              <ul class="m-0 flex list-none flex-col gap-[.4vh] p-0 text-[1.3vw]">
                {board.byes.map((name) => <li key={name} class="truncate">{name}</li>)}
              </ul>
            </section>
          )}
          {board.code && <LateJoin code={board.code} />}
        </aside>
      </div>

      <footer class="flex justify-between gap-[2vw] text-[1.1vw] text-muted">
        <div class="flex gap-[1.6vw]">
          {(Object.keys(LABEL) as TableColor[]).map((c) => (
            <span key={c} class="inline-flex items-center gap-[.5vw]"><i class={`size-[.9vw] rounded-full ${DOT[c]}`} />{LABEL[c]}</span>
          ))}
        </div>
        {all.length > 1 && <div>Página {(page % all.length) + 1} de {all.length}</div>}
      </footer>
    </div>
  );
};
