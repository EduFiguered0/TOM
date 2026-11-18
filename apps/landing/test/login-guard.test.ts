import { describe, expect, it } from 'vitest';
import { createLoginGuard } from '../src/login-guard.js';

const memory = () => {
  const store = {
    value: null as string | null,
    get: () => store.value,
    set: (v: string) => { store.value = v; },
    clear: () => { store.value = null; },
  };
  return store;
};

describe('nova ida ao Google depois de 401', () => {
  it('tenta uma vez; na segunda recusa seguida, para (sem loop de redirecionamento)', () => {
    const store = memory();
    expect(createLoginGuard(store).mayRetry()).toBe(true);
    // Página recarregada na volta do Google: o guarda lembra da tentativa.
    expect(createLoginGuard(store).mayRetry()).toBe(false);
  });

  it('depois de um acesso que deu certo, volta a permitir', () => {
    const store = memory();
    const guard = createLoginGuard(store);
    guard.mayRetry();
    guard.succeeded();
    expect(createLoginGuard(store).mayRetry()).toBe(true);
  });
});
