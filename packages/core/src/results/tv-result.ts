import type { TableStatus } from './thermometer.js';

/** O que a TV mostra de uma mesa verde: quem venceu, empate ou derrota dupla. Nunca o placar. */
export type TvResult = 'player1' | 'player2' | 'tie' | 'double_loss';

/** null fora do verde (e no bye, que a TV lista à parte). */
export const tvResult = (status: TableStatus): TvResult | null => {
  if (status.color !== 'green') return null;
  const { result } = status;
  switch (result.kind) {
    case 'games':
      return result.winner ?? 'tie';
    case 'intentional_draw':
      return 'tie';
    case 'double_game_loss':
      return 'double_loss';
    case 'bye':
      return null;
  }
};
