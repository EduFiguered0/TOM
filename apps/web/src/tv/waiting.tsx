import type { BoardResponse } from '@tom/contracts';
import { encode } from 'uqr';
import { STORE } from '../public/store.js';
import { confirmCall, joinUrl, qrPath } from './board.js';
import { centered, eventTitle, screen, tile } from './styles.js';

type Waiting = Exclude<BoardResponse, { state: 'running' }>;

const count = 'm-0 text-[4vw] font-extrabold tabular-nums';

/** QR desenhado como um caminho SVG; o endereço fica escrito embaixo para quem não consegue escanear. */
const Qr = ({ url }: { url: string }) => {
  const { data, size } = encode(url, { border: 2 });
  return (
    <svg class="aspect-square h-[58vh] w-auto rounded-[1vw]" viewBox={`0 0 ${String(size)} ${String(size)}`} role="img"
      aria-label={`QR Code para ${url}`} shape-rendering="crispEdges">
      <rect width={size} height={size} fill="#fff" />
      <path d={qrPath(data)} fill="#000" />
    </svg>
  );
};

/** TV fora da rodada: espera da loja, QR de inscrição, confirmação de presença ou classificação final. */
export const WaitingTv = ({ board }: { board: Waiting }) => {
  if (board.state === 'idle') {
    return <div class={centered}><p class="m-0 text-[6vw] font-extrabold">{STORE.name}</p></div>;
  }
  if (board.state === 'open') {
    const url = joinUrl(location.origin, board.code);
    return (
      <div class={centered}>
        <div class="text-[3.4vw] font-bold">{board.event.label}</div>
        <Qr url={url} />
        <p class="m-0 text-[1.8vw] text-muted">Escaneie para se inscrever · <span class="text-text">{url}</span></p>
        <p class={count}>{board.registered} {board.registered === 1 ? 'inscrito' : 'inscritos'}</p>
      </div>
    );
  }
  if (board.state === 'confirming') {
    return (
      <div class={centered}>
        <div class="text-[3.4vw] font-bold">{board.event.label}</div>
        <p class="m-0 text-[4.4vw] font-extrabold text-orange">{confirmCall(board)}</p>
        <p class={count}>{board.confirmed} de {board.registered} confirmados</p>
      </div>
    );
  }
  return (
    <div class={screen}>
      <header><div class={eventTitle}>{board.event.label} · Classificação final</div></header>
      <ol class="m-0 grid flex-1 list-none auto-rows-[minmax(0,6vh)] grid-cols-2 gap-x-[1.5vw] gap-y-[1vh] p-0">
        {board.standings.map((s) => (
          <li key={`${s.division}-${String(s.rank)}`} class={`${tile} text-[1.8vw]`}>
            <span class="w-[3.6vw] text-right font-extrabold tabular-nums">{s.rank}</span>
            <span class="min-w-0 flex-1 truncate">{s.name}</span>
            <span class="tabular-nums text-muted">{s.wins}-{s.losses}-{s.ties}</span>
          </li>
        ))}
      </ol>
    </div>
  );
};
