import type { BoardResponse } from '@tom/contracts';
import { STORE } from '../public/store.js';
import { joinUrl } from './board.js';
import { FinalTv } from './final.js';
import { Qr } from './qr.js';
import { centered } from './styles.js';

type Waiting = Exclude<BoardResponse, { state: 'running' }>;

const count = 'm-0 text-[4vw] font-extrabold tabular-nums';

/** TV fora da rodada: espera da loja, QR de inscrição ou classificação final. */
export const WaitingTv = ({ board }: { board: Waiting }) => {
  if (board.state === 'idle') {
    return <div class={centered}><p class="m-0 text-[6vw] font-extrabold">{STORE.name}</p></div>;
  }
  if (board.state === 'open') {
    const url = joinUrl(location.origin, board.code);
    return (
      <div class={centered}>
        <div class="text-[3.4vw] font-bold">{board.event.label}</div>
        <Qr url={url} class="h-[58vh]" />
        <p class="m-0 text-[1.8vw] text-muted">Escaneie para se inscrever · <span class="text-text">{url}</span></p>
        <p class={count}>{board.registered} {board.registered === 1 ? 'inscrito' : 'inscritos'}</p>
      </div>
    );
  }
  return <FinalTv label={board.event.label} standings={board.standings} />;
};
