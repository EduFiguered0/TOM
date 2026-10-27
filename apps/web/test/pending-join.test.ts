import { describe, expect, it } from 'vitest';
import { createPendingJoin, joinCodeOf } from '../src/pending-join.js';

const memory = () => {
  let value: string | null = null;
  return { getItem: () => value, setItem: (_: string, v: string) => { value = v; }, removeItem: () => { value = null; } };
};

describe('código do QR guardado durante o login', () => {
  it('guarda, lê uma vez e some', () => {
    const pending = createPendingJoin(memory());
    pending.save('ABCD2345');
    expect(pending.take()).toBe('ABCD2345');
    expect(pending.take()).toBeNull();
  });

  it('armazenamento que lança erro não quebra', () => {
    const broken = { getItem: () => { throw new Error('bloqueado'); }, setItem: () => { throw new Error('bloqueado'); }, removeItem: () => { throw new Error('bloqueado'); } };
    const pending = createPendingJoin(broken);
    expect(() => { pending.save('ABCD2345'); }).not.toThrow();
    expect(pending.take()).toBeNull();
  });

  it('lê o código do caminho /e/<código>', () => {
    expect(joinCodeOf('/e/ABCD2345')).toBe('ABCD2345');
    expect(joinCodeOf('/e/abcd2345')).toBe('ABCD2345');
    expect(joinCodeOf('/e/curto')).toBeNull();
    expect(joinCodeOf('/conta')).toBeNull();
  });
});

describe('inscrição pelo QR só quando a conta está pronta', () => {
  it('sem Player ID o código fica guardado; com Player ID, é usado uma vez', () => {
    const pending = createPendingJoin(memory());
    pending.save('ABCD2345');
    expect(pending.takeIfReady({ playerId: null, nameReviewed: true })).toBeNull();
    expect(pending.takeIfReady({ playerId: '100001', nameReviewed: true })).toBe('ABCD2345');
    expect(pending.takeIfReady({ playerId: '100001', nameReviewed: true })).toBeNull();
  });

  it('conta antiga só se inscreve depois de conferir o nome (a inscrição copia o nome)', () => {
    const pending = createPendingJoin(memory());
    pending.save('ABCD2345');
    expect(pending.takeIfReady({ playerId: '100001', nameReviewed: false })).toBeNull();
    expect(pending.takeIfReady({ playerId: '100001', nameReviewed: true })).toBe('ABCD2345');
  });
});
