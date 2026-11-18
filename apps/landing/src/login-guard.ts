export interface GuardStore {
  get(): string | null;
  set(value: string): void;
  clear(): void;
}

/**
 * Se a API recusar um token que o Google acabou de dar (configuração errada, relógio), voltar ao Google entraria em
 * loop: o Cognito loga de novo na hora. Uma tentativa por aba; a segunda recusa seguida mostra o erro.
 */
export const createLoginGuard = (store: GuardStore) => ({
  mayRetry(): boolean {
    if (store.get()) return false;
    store.set('1');
    return true;
  },
  succeeded() {
    store.clear();
  },
});
