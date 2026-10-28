import type { ReportDto, SeatDto } from '@tom/contracts';

export interface ReportOption {
  label: string;
  report: ReportDto;
  tone: 'win' | 'loss' | 'draw';
}

/** O jogador só diz se ganhou ou perdeu: o TOM não recebe placar. O servidor confere com o reporte do oponente. */
export const reportOptions = (): ReportOption[] => [
  { label: 'Ganhei', report: { kind: 'score', own: 1, opponent: 0 }, tone: 'win' },
  { label: 'Perdi', report: { kind: 'score', own: 0, opponent: 1 }, tone: 'loss' },
];

/** Placares possíveis do ponto de vista de um jogador (regra do servidor: ninguém passa da vitória, total ≤ melhor de). */
export const scoreOptions = (bestOf: 1 | 3): [number, number][] => {
  const max = Math.ceil(bestOf / 2);
  const scores: [number, number][] = [];
  for (let own = max; own >= 0; own--) {
    for (let opponent = 0; opponent <= max; opponent++) {
      if ((own === max && opponent === max) || own + opponent > bestOf) continue;
      scores.push([own, opponent]);
    }
  }
  // Vitórias 2x0, 2x1, 1x0; derrotas espelhadas (0x2, 1x2, 0x1); empates.
  const tone = ([own, opp]: [number, number]) => (own > opp ? 0 : own < opp ? 1 : 2);
  const key = ([own, opp]: [number, number]) => (own < opp ? [opp, -own] : [own, -opp]);
  return scores.sort((a, b) => {
    const [ka, kb] = [key(a), key(b)];
    return tone(a) - tone(b) || (kb[0] ?? 0) - (ka[0] ?? 0) || (kb[1] ?? 0) - (ka[1] ?? 0);
  });
};

export const describeReport = (report: ReportDto): string =>
  report.kind === 'intentional_draw' ? 'Intentional draw (ID)'
    : report.own > report.opponent ? 'Ganhei' : report.own < report.opponent ? 'Perdi' : 'Empate';

type TableSeat = Extract<SeatDto, { kind: 'table' }>;

/** O que fazer agora, em uma frase, para cada cor da mesa (spec, "Termômetro"). */
export const seatMessage = (seat: TableSeat, started: boolean): { tone: 'muted' | 'warn' | 'ok' | 'error'; text: string } => {
  switch (seat.color) {
    case 'green':
      return { tone: 'ok', text: 'Resultado validado. Bom jogo!' };
    case 'red':
      return seat.redReason === 'timeout'
        ? { tone: 'error', text: 'Tempo esgotado: o juiz vai até a mesa.' }
        : { tone: 'error', text: 'Os reportes não batem. Chamem o juiz.' };
    case 'orange':
      return seat.myReport
        ? { tone: 'warn', text: 'Resultado enviado. Aguardando o oponente.' }
        : { tone: 'warn', text: 'Seu oponente já reportou. Falta o seu.' };
    case 'gray':
      return started
        ? { tone: 'muted', text: 'Reporte o resultado quando a partida terminar.' }
        : { tone: 'muted', text: 'Aguardando o ADM iniciar a rodada.' };
  }
};
