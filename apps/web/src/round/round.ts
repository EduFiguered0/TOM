import type { ReportDto, SeatDto } from '@tom/contracts';

export interface ReportOption {
  label: string;
  report: ReportDto;
  tone: 'win' | 'loss' | 'draw';
}

/** Placares possíveis do ponto de vista do jogador (mesma regra do servidor: ninguém passa da vitória, total ≤ melhor de). */
export const reportOptions = (bestOf: 1 | 3): ReportOption[] => {
  const max = Math.ceil(bestOf / 2);
  const scores: ReportOption[] = [];
  for (let own = max; own >= 0; own--) {
    for (let opponent = 0; opponent <= max; opponent++) {
      if ((own === max && opponent === max) || own + opponent > bestOf) continue;
      const tone = own > opponent ? 'win' : own < opponent ? 'loss' : 'draw';
      const verb = tone === 'win' ? 'Ganhei' : tone === 'loss' ? 'Perdi' : 'Empate';
      scores.push({ label: `${verb} ${String(own)}x${String(opponent)}`, report: { kind: 'score', own, opponent }, tone });
    }
  }
  // Vitórias 2x0, 2x1, 1x0; derrotas espelhadas (0x2, 1x2, 0x1); empates.
  const order = { win: 0, loss: 1, draw: 2 };
  const key = ({ report, tone }: ReportOption) => {
    const [own, opp] = report.kind === 'score' ? [report.own, report.opponent] : [0, 0];
    return tone === 'loss' ? [opp, -own] : [own, -opp];
  };
  const byScore = (a: ReportOption, b: ReportOption) => {
    const [ka, kb] = [key(a), key(b)];
    return (kb[0] ?? 0) - (ka[0] ?? 0) || (kb[1] ?? 0) - (ka[1] ?? 0);
  };
  return [
    ...scores.sort((a, b) => order[a.tone] - order[b.tone] || byScore(a, b)),
    { label: 'Intentional draw (ID)', report: { kind: 'intentional_draw' }, tone: 'draw' },
  ];
};

export const describeReport = (report: ReportDto): string =>
  report.kind === 'intentional_draw' ? 'Intentional draw (ID)' : `${String(report.own)}x${String(report.opponent)}`;

type TableSeat = Extract<SeatDto, { kind: 'table' }>;

/** O que fazer agora, em uma frase, para cada cor da mesa (spec, "Termômetro"). */
export const seatMessage = (seat: TableSeat, started: boolean): { tone: 'muted' | 'warn' | 'ok' | 'error'; text: string } => {
  switch (seat.color) {
    case 'green':
      return { tone: 'ok', text: 'Resultado validado. Bom jogo!' };
    case 'red':
      return seat.redReason === 'timeout'
        ? { tone: 'error', text: 'Tempo esgotado: o juiz vai até a mesa.' }
        : { tone: 'error', text: 'Os reportes não batem. Confiram juntos e corrijam, ou chamem o juiz.' };
    case 'orange':
      return seat.myReport
        ? { tone: 'warn', text: 'Seu reporte foi registrado. Aguardando o oponente.' }
        : { tone: 'warn', text: 'Seu oponente já reportou. Falta o seu.' };
    case 'gray':
      return started
        ? { tone: 'muted', text: 'Reporte o resultado quando a partida terminar.' }
        : { tone: 'muted', text: 'Aguardando o ADM iniciar a rodada.' };
  }
};
