/** Outra gravação passou na frente: a versão esperada não é mais a atual. */
export class ConcurrencyError extends Error {
  override name = 'ConcurrencyError';
}
