const KEY = 'tom.join';
const CODE = /^\/e\/([A-Za-z0-9]{8})\/?$/;

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem' | 'removeItem'>;

/**
 * Código do QR guardado enquanto o jogador entra (login, Google, cadastro): a inscrição acontece sozinha no fim.
 * Armazenamento bloqueado (aba anônima): o código se perde e o jogador escaneia de novo.
 */
export const createPendingJoin = (storage: Storage) => ({
  save(code: string) {
    try { storage.setItem(KEY, code); } catch { /* sem armazenamento */ }
  },
  take(): string | null {
    try {
      const code = storage.getItem(KEY);
      storage.removeItem(KEY);
      return code;
    } catch {
      return null;
    }
  },
  /**
   * Sem Player ID a inscrição seria recusada, e sem conferir o nome ela copiaria o nome separado automaticamente:
   * o código fica guardado até o jogador resolver os dois.
   */
  takeIfReady(me: { playerId: string | null; nameReviewed: boolean }): string | null {
    return me.playerId && me.nameReviewed ? this.take() : null;
  },
});

export type PendingJoin = ReturnType<typeof createPendingJoin>;

/** `/e/<código>` → código em maiúsculas; outro caminho → null. */
export const joinCodeOf = (pathname: string): string | null => CODE.exec(pathname)?.[1]?.toUpperCase() ?? null;
