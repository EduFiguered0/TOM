export const DEFAULT_ROUND_MINUTES = 50;

export class InvalidDurationError extends Error {
  override name = 'InvalidDurationError';
}

const assertMinutes = (value: number, field: string, min: number): void => {
  if (!Number.isInteger(value) || value < min) throw new InvalidDurationError(`${field} inválido: ${String(value)}`);
};

/** Guarda-se o início da rodada, não uma contagem; o prazo da mesa inclui o acréscimo dela. */
export const tableDeadline = (roundStartedAt: Date, roundMinutes = DEFAULT_ROUND_MINUTES, extraMinutes = 0): Date => {
  assertMinutes(roundMinutes, 'Tempo da rodada', 1);
  assertMinutes(extraMinutes, 'Acréscimo', 0);
  return new Date(roundStartedAt.getTime() + (roundMinutes + extraMinutes) * 60_000);
};
