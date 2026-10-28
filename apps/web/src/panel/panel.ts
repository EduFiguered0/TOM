import type { OverrideDto, PanelTable, ReportDto } from '@tom/contracts';
import { scoreOptions } from '../round/round.js';

/** O que precisa de ação vem primeiro: vermelho (juiz), laranja, cinza, verde a lançar; key lançada por último. */
const PRIORITY = { red: 0, orange: 1, gray: 2, green: 3 } as const;

export const sortForAction = (tables: readonly PanelTable[]): PanelTable[] =>
  [...tables].sort((a, b) =>
    Number(a.keyLaunched) - Number(b.keyLaunched) || PRIORITY[a.color] - PRIORITY[b.color] || a.table - b.table);

/** Mesa aberta ao lado da tabela: a escolhida, se ainda existe; senão a primeira que pede ação. */
export const pickTable = (tables: readonly PanelTable[], selected: number | null): number | null =>
  tables.some((t) => t.table === selected) ? selected : (sortForAction(tables)[0]?.table ?? null);

/** Placares do ajuste do ADM (games do jogador 1 x do jogador 2): vitórias, derrotas e empates; sem o ID. */
export const overrideScores = (bestOf: 1 | 3): [number, number][] => scoreOptions(bestOf);

export const describePlayerReport = (report: ReportDto | null): string =>
  !report ? 'não reportou' : report.kind === 'intentional_draw' ? 'ID' : `${String(report.own)}x${String(report.opponent)}`;

export const describeOverride = (o: OverrideDto, table: Pick<PanelTable, 'player1' | 'player2'>): string => {
  switch (o.kind) {
    case 'score': {
      const [high, low] = [Math.max(o.player1, o.player2), Math.min(o.player1, o.player2)];
      if (o.player1 === o.player2) return `Empate ${String(high)}x${String(low)}`;
      return `${o.player1 > o.player2 ? table.player1.name : table.player2.name} venceu ${String(high)}x${String(low)}`;
    }
    case 'intentional_draw': return 'Intentional draw (ID)';
    case 'double_game_loss': return 'Double game loss (DGL)';
    case 'win_by_absence': return `Vitória por ausência de ${o.winner === 'player1' ? table.player2.name : table.player1.name}`;
  }
};

/** O que a organização faz com esta mesa agora. */
export const nextAction = (t: PanelTable, started: boolean): string => {
  if (t.keyLaunched) return 'Key lançada';
  switch (t.color) {
    case 'green': return t.tomKey ? 'Lançar a key no TOM' : 'Validada: lançar o resultado à mão no TOM (DGL)';
    case 'red': return t.redReason === 'timeout' ? 'Tempo esgotado: juiz na mesa' : 'Reportes não batem: juiz na mesa';
    case 'orange': return 'Aguardando o outro jogador';
    case 'gray': return started ? 'Aguardando reportes' : 'Rodada não iniciada';
  }
};
