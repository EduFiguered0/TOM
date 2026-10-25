import type { PanelTable, TableColor } from '@tom/contracts';
import { nextAction, sortForAction } from './panel.js';

export const DOT: Record<TableColor, string> = { gray: 'bg-gray', orange: 'bg-orange', green: 'bg-green', red: 'bg-red' };

interface Props {
  tables: readonly PanelTable[];
  started: boolean;
  selected: number | null;
  onSelect: (table: number) => void;
  /** Relógio de cada mesa (com acréscimo), já formatado; null fora do tempo. */
  clockOf: (t: PanelTable) => { text: string; warning: boolean } | null;
}

/** Mesas da rodada, na ordem de ação; a linha escolhida abre o detalhe ao lado. Rola por dentro. */
export const TablesList = ({ tables, started, selected, onSelect, clockOf }: Props) => (
  <div class="min-h-0 flex-1 overflow-y-auto">
    <table class="w-full border-collapse text-sm">
      <thead class="sticky top-0 bg-panel">
        <tr class="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
          <th class="px-3 py-2 font-semibold">Mesa</th><th class="py-2 pr-2 font-semibold">Jogador 1</th>
          <th class="py-2 pr-2 font-semibold">Jogador 2</th><th class="py-2 pr-2 font-semibold">Situação</th>
          <th class="py-2 pr-3 text-right font-semibold">Key</th>
        </tr>
      </thead>
      <tbody>
        {sortForAction(tables).map((t) => {
          const clock = clockOf(t);
          return (
            <tr key={t.table} tabIndex={0} aria-selected={selected === t.table}
              class={`cursor-pointer border-b border-line ${selected === t.table ? 'bg-accent/10' : 'hover:bg-bg'} ${t.keyLaunched ? 'text-muted' : ''}`}
              onClick={() => { onSelect(t.table); }}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(t.table); } }}>
              <td class="px-3 py-2 text-base font-extrabold tabular-nums">{t.table}</td>
              <td class="py-2 pr-2">{t.player1.name}</td>
              <td class="py-2 pr-2">{t.player2.name}</td>
              <td class="py-2 pr-2">
                <span class="flex items-center gap-2">
                  <span class={`size-2.5 shrink-0 rounded-full ${DOT[t.color]}`} aria-hidden="true" />
                  {nextAction(t, started)}
                  {clock && t.color !== 'green' && <span class={`ml-auto tabular-nums ${clock.warning ? 'text-warn' : 'text-muted'}`}>{clock.text}</span>}
                </span>
              </td>
              <td class="py-2 pr-3 text-right">
                {t.tomKey && !t.keyLaunched && <span class="rounded border border-dashed border-green px-1.5 font-mono font-extrabold" title={t.tomKey.label}>{t.tomKey.code}</span>}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);
