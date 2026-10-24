import type { BoardResponse } from '@tom/contracts';
import { encode } from 'uqr';
import { STORE } from '../public/store.js';
import { joinUrl, qrPath } from './board.js';
import './tv.css';

type Waiting = Exclude<BoardResponse, { state: 'running' }>;

/** QR desenhado como um caminho SVG; o endereço fica escrito embaixo para quem não consegue escanear. */
const Qr = ({ url }: { url: string }) => {
  const { data, size } = encode(url, { border: 2 });
  return (
    <svg class="tv-qr" viewBox={`0 0 ${String(size)} ${String(size)}`} role="img" aria-label={`QR Code para ${url}`} shape-rendering="crispEdges">
      <rect width={size} height={size} fill="#fff" />
      <path d={qrPath(data)} fill="#000" />
    </svg>
  );
};

/** TV fora da rodada: espera da loja, QR de inscrição, confirmação de presença ou classificação final. */
export const WaitingTv = ({ board }: { board: Waiting }) => {
  if (board.state === 'idle') {
    return <div class="tv tv-empty"><p class="tv-store">{STORE.name}</p></div>;
  }
  if (board.state === 'open') {
    const url = joinUrl(location.origin, board.code);
    return (
      <div class="tv tv-wait">
        <div class="tv-event">{board.event.label}</div>
        <Qr url={url} />
        <p class="tv-hint">Escaneie para se inscrever · <span class="tv-url">{url}</span></p>
        <p class="tv-count">{board.registered} {board.registered === 1 ? 'inscrito' : 'inscritos'}</p>
      </div>
    );
  }
  if (board.state === 'confirming') {
    return (
      <div class="tv tv-wait">
        <div class="tv-event">{board.event.label}</div>
        <p class="tv-call">Confirme sua presença no celular</p>
        <p class="tv-count">{board.confirmed} de {board.registered} confirmados</p>
      </div>
    );
  }
  return (
    <div class="tv">
      <header class="tv-head"><div class="tv-event">{board.event.label} · Classificação final</div></header>
      <ol class="tv-standings">
        {board.standings.map((s) => (
          <li key={`${s.division}-${String(s.rank)}`}>
            <span class="tv-number">{s.rank}</span>
            <span class="tv-name">{s.name}</span>
            <span class="tv-record">{s.wins}-{s.losses}-{s.ties}</span>
          </li>
        ))}
      </ol>
    </div>
  );
};
