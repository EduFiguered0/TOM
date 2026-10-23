declare const brand: unique symbol;

/** Player ID da Pokémon: chave do jogador no cadastro e no TOM. Nome nunca é chave. */
export type PlayerId = string & { readonly [brand]: 'PlayerId' };

export class InvalidPlayerIdError extends Error {
  override name = 'InvalidPlayerIdError';
}

export const toPlayerId = (value: string): PlayerId => {
  const id = value.trim();
  if (!/^\d+$/.test(id)) throw new InvalidPlayerIdError(`Player ID inválido: "${value}"`);
  return id as PlayerId;
};
