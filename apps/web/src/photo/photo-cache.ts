/** Cada foto é baixada uma vez por aba (a chave muda quando a foto muda); falha tenta de novo na próxima vez. */
export const createPhotoCache = (fetchPhoto: (id: string) => Promise<string | null>) => {
  const cache = new Map<string, Promise<string | null>>();
  return {
    get(id: string): Promise<string | null> {
      const hit = cache.get(id);
      if (hit) return hit;
      const loading = fetchPhoto(id).catch((error: unknown) => { cache.delete(id); throw error; });
      cache.set(id, loading);
      return loading;
    },
  };
};

export type PhotoCache = ReturnType<typeof createPhotoCache>;

/** Avatar genérico: iniciais do primeiro e do último nome. */
export const initials = (name: string): string => {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const first = words[0]?.[0] ?? '';
  const last = words.length > 1 ? words.at(-1)?.[0] ?? '' : '';
  return `${first}${last}`.toUpperCase();
};

/**
 * Mesma regra do servidor: só o ano de nascimento é conhecido, então a autorização do responsável é pedida até o
 * ano em que a pessoa faz 18 (nunca mostra a foto de um menor).
 */
export const needsImageConsent = (birthYear: number, now = new Date()): boolean => now.getUTCFullYear() - birthYear <= 18;
