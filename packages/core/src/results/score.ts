/** Formato da partida, configurado por evento. */
export type BestOf = 1 | 3;

export type Side = 'player1' | 'player2';

export type Outcome = 'win' | 'loss' | 'draw';

export class InvalidScoreError extends Error {
  override name = 'InvalidScoreError';
}

const winsNeeded = (bestOf: BestOf): number => Math.ceil(bestOf / 2);

/** Placar de games válido para o formato: 2x1, 1x0, 1x1 (empate)... nunca os dois com a vitória. */
export const assertValidGames = (a: number, b: number, bestOf: BestOf): void => {
  const max = winsNeeded(bestOf);
  const inRange = (n: number): boolean => Number.isInteger(n) && n >= 0 && n <= max;
  if (!inRange(a) || !inRange(b) || (a === max && b === max) || a + b > bestOf) {
    throw new InvalidScoreError(`Placar ${String(a)}x${String(b)} inválido para melhor de ${String(bestOf)}`);
  }
};

export const outcomeOf = (own: number, opponent: number): Outcome =>
  own > opponent ? 'win' : own < opponent ? 'loss' : 'draw';

export const otherSide = (side: Side): Side => (side === 'player1' ? 'player2' : 'player1');
