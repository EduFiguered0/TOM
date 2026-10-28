import type { PanelTable } from '@tom/contracts';
import { resultsToShow, winnerOf } from './panel.js';

type Side = 'player1' | 'player2';

interface Props {
  tables: readonly PanelTable[];
  busy: boolean;
  /** O ADM decide: Vitória num jogador = ele vence; Derrota = vence o oponente. */
  onResult: (table: number, side: Side, outcome: 'win' | 'loss') => void;
}

const BUTTON = 'rounded-md border px-3 py-1 text-xs font-semibold disabled:opacity-60';
/** Aceso = resultado atual da mesa; apagado = opção. */
const TONE = {
  win: { on: 'border-green bg-green text-bg', off: 'border-green/60 text-ok hover:bg-green/15' },
  loss: { on: 'border-red bg-red text-white', off: 'border-red/60 text-error hover:bg-red/15' },
} as const;

/** Lista de resultados do painel lateral: todas as mesas, uma seção por mesa, Vitória/Derrota por jogador. Sem confirmação. */
export const ResultsList = ({ tables, busy, onResult }: Props) => (
  <div class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto border-t border-line pt-3">
    <h3 class="m-0 text-sm font-bold">Resultados</h3>
    {resultsToShow(tables).map((t) => {
      const winner = winnerOf(t);
      return (
        <section key={t.table} class="flex flex-col gap-1.5" aria-label={`Mesa ${String(t.table)}`}>
          <h4 class="m-0 border-b border-line pb-1 text-xs font-bold uppercase tracking-wide text-muted">Mesa {t.table}</h4>
          {(['player1', 'player2'] as const).map((side) => {
            const first = t[side].name.split(' ')[0] ?? t[side].name;
            const won = winner === side;
            const lost = winner !== null && !won;
            return (
              <div key={side} class="grid grid-cols-[1fr_auto_auto] items-center gap-1.5">
                <span class="truncate text-sm" title={t[side].name}>{first}</span>
                <button type="button" disabled={busy} aria-pressed={won} aria-label={`${t[side].name}: Vitória`}
                  class={`${BUTTON} ${won ? TONE.win.on : TONE.win.off}`} onClick={() => { onResult(t.table, side, 'win'); }}>Vitória</button>
                <button type="button" disabled={busy} aria-pressed={lost} aria-label={`${t[side].name}: Derrota`}
                  class={`${BUTTON} ${lost ? TONE.loss.on : TONE.loss.off}`} onClick={() => { onResult(t.table, side, 'loss'); }}>Derrota</button>
              </div>
            );
          })}
        </section>
      );
    })}
  </div>
);
