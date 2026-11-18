import { describe, expect, it } from 'vitest';
import { nextStep } from '../src/flow.js';

const complete = { missing: [] };
const incomplete = { missing: ['phone' as const] };

describe('passo seguinte ao clicar em comprar', () => {
  it('sem evento escolhido: só a vitrine', () => {
    expect(nextStep({ loggedIn: true, me: complete, wantsEvent: null })).toBe('browse');
  });

  it('sem login: vai ao Google', () => {
    expect(nextStep({ loggedIn: false, me: null, wantsEvent: 'e1' })).toBe('login');
  });

  it('logado com cadastro faltando: formulário', () => {
    expect(nextStep({ loggedIn: true, me: incomplete, wantsEvent: 'e1' })).toBe('profile');
  });

  it('logado e completo: segue para a compra', () => {
    expect(nextStep({ loggedIn: true, me: complete, wantsEvent: 'e1' })).toBe('redirecting');
  });

  it('logado sem dados carregados ainda: carrega', () => {
    expect(nextStep({ loggedIn: true, me: null, wantsEvent: 'e1' })).toBe('loading');
  });
});
