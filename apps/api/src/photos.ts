import { toPlayerId, visiblePhoto, type AccountRepository } from '@tom/core';

/** A TV consulta a cada 5 s: a chave da foto de cada jogador é lida no máximo uma vez por minuto por instância. */
const CACHE_MS = 60_000;

/**
 * Chave da foto visível de quem tem esse Player ID (null: sem foto, menor sem autorização ou sem conta).
 * Quem recebe a chave pode ver a foto: só o quadro do ADM e o assento do oponente a recebem.
 */
export const createPhotoLookup = (accounts: AccountRepository, now: () => Date, cacheMs = CACHE_MS) => {
  const cache = new Map<string, { photo: string | null; at: number }>();
  return async (playerId: string): Promise<string | null> => {
    const hit = cache.get(playerId);
    if (hit && now().getTime() - hit.at < cacheMs) return hit.photo;
    let photo: string | null = null;
    try {
      const record = await accounts.findByPlayerId(toPlayerId(playerId));
      photo = record ? visiblePhoto(record.account, now()) : null;
    } catch {
      photo = null;
    }
    cache.set(playerId, { photo, at: now().getTime() });
    return photo;
  };
};

export type PhotoLookup = ReturnType<typeof createPhotoLookup>;
