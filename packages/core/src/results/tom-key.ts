import type { MatchResult } from './match-result.js';

/** As três keys da guia (match_slips) do TOM. */
export type TomKey = 'player1Wins' | 'player2Wins' | 'tie';

/** Qual key o ADM lança no TOM. null: bye (o TOM já resolve) ou double game loss (lançado à mão no TOM). */
export const tomKeyFor = (result: MatchResult): TomKey | null => {
  switch (result.kind) {
    case 'games':
      return result.winner === 'player1' ? 'player1Wins' : result.winner === 'player2' ? 'player2Wins' : 'tie';
    case 'intentional_draw':
      return 'tie';
    case 'double_game_loss':
    case 'bye':
      return null;
  }
};
