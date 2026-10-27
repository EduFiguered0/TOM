import { describe, expect, it } from 'vitest';
import { maskEmail, maskPhone } from '../../src/index.js';

describe('máscaras da guia Jogadores', () => {
  it('e-mail: 3 primeiros caracteres e o domínio inteiro', () => {
    expect(maskEmail('dukarino@gmail.com')).toBe('duk•••@gmail.com');
    expect(maskEmail('ab@x.com')).toBe('ab•••@x.com');
    expect(maskEmail('semarroba')).toBe('sem•••');
  });

  it('telefone: só os 4 últimos números; sem telefone, nada', () => {
    expect(maskPhone('11988887777')).toBe('•••• 7777');
    expect(maskPhone(null)).toBeNull();
  });
});
