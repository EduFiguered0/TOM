import type { OverrideDto, PanelTable, ReportDto } from '@tom/contracts';

/** O que precisa de ação vem primeiro: vermelho (juiz), laranja, cinza, verde a lançar; key lançada por último. */
const PRIORITY = { red: 0, orange: 1, gray: 2, green: 3 } as const;

export const sortForAction = (tables: readonly PanelTable[]): PanelTable[] =>
  [...tables].sort((a, b) =>
    Number(a.keyLaunched) - Number(b.keyLaunched) || PRIORITY[a.color] - PRIORITY[b.color] || a.table - b.table);

export const describePlayerReport = (report: ReportDto | null): string =>
  !report ? 'não reportou' : report.kind === 'intentional_draw' ? 'ID' : `${String(report.own)}x${String(report.opponent)}`;

export const describeOverride = (o: OverrideDto, table: Pick<PanelTable, 'player1' | 'player2'>): string => {
  switch (o.kind) {
    case 'score': return `Placar ${String(o.player1)}x${String(o.player2)}`;
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
