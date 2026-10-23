import { assertValidGames, type BestOf } from './score.js';

/** O que um jogador reporta, do ponto de vista dele. */
export type Report = { kind: 'score'; own: number; opponent: number } | { kind: 'intentional_draw' };

export const scoreReport = (own: number, opponent: number, bestOf: BestOf): Report => {
  assertValidGames(own, opponent, bestOf);
  return { kind: 'score', own, opponent };
};

export const intentionalDrawReport = (): Report => ({ kind: 'intentional_draw' });
