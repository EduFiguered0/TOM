import type { BoardResponse } from '@tom/contracts';
import { StandingsTable } from './final.js';
import { LateJoin } from './tv.js';
import { eventTitle, screen } from './styles.js';

/** Entre rodadas: a tela da rodada com a classificação no lugar das mesas, sem cronômetro e com o QR. */
export const PartialTv = ({ board }: { board: Extract<BoardResponse, { state: 'standings' }> }) => (
  <div class={screen}>
    <header>
      <div class={eventTitle}>{board.event.label}</div>
      <div class="text-[1.6vw] text-muted">Classificação após a rodada {board.round} · {board.division}</div>
    </header>
    <div class="grid min-h-0 flex-1 grid-cols-[1fr_17vw] gap-[1.5vw]">
      <StandingsTable standings={board.standings} />
      <aside class="flex min-h-0 flex-col">{board.code && <LateJoin code={board.code} />}</aside>
    </div>
  </div>
);
