import { describe, expect, it } from 'vitest';
import { InvalidPlayerIdError, toPlayerId } from '../src/index.js';

describe('toPlayerId', () => {
  it('aceita só dígitos e remove espaços', () => {
    expect(toPlayerId(' 100001 ')).toBe('100001');
  });

  it.each(['', 'abc', '100 001', '-1'])('rejeita "%s"', (value) => {
    expect(() => toPlayerId(value)).toThrow(InvalidPlayerIdError);
  });
});
