import { assertValidGames, type BestOf, type Side } from './score.js';

/** Resultado final da mesa, sempre na ótica do TOM (player1 x player2). */
export type MatchResult =
  | { kind: 'games'; player1: number; player2: number; winner: Side | null }
  | { kind: 'intentional_draw' }
  | { kind: 'double_game_loss' }
  | { kind: 'bye' };

/** Decisão do juiz/ADM; prevalece sobre os reportes. Autor, motivo e horário ficam no evento. */
export type Override =
  | { kind: 'score'; player1: number; player2: number }
  | { kind: 'intentional_draw' }
  | { kind: 'double_game_loss' }
  | { kind: 'win_by_absence'; winner: Side };

export const gamesResult = (player1: number, player2: number): MatchResult => ({
  kind: 'games',
  player1,
  player2,
  winner: player1 > player2 ? 'player1' : player2 > player1 ? 'player2' : null,
});

export const overrideResult = (override: Override, bestOf: BestOf): MatchResult => {
  switch (override.kind) {
    case 'score':
      assertValidGames(override.player1, override.player2, bestOf);
      return gamesResult(override.player1, override.player2);
    case 'win_by_absence': {
      const wins = Math.ceil(bestOf / 2);
      return override.winner === 'player1' ? gamesResult(wins, 0) : gamesResult(0, wins);
    }
    case 'intentional_draw':
    case 'double_game_loss':
      return { kind: override.kind };
  }
};
