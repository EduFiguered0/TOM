import { describe, expect, it } from 'vitest';
import { adminChangesText, editRequest } from '../src/screens/player-edit.js';

describe('ADM corrige os dados do jogador', () => {
  it('telefone vazio mantém o atual; Player ID vazio desfaz o vínculo', () => {
    expect(editRequest({ firstName: ' Ana ', lastName: 'Lima', birthYear: '1990', phone: ' ', playerId: ' ' }))
      .toEqual({ firstName: ' Ana ', lastName: 'Lima', birthYear: 1990, playerId: null });
  });

  it('telefone e Player ID digitados vão no pedido', () => {
    expect(editRequest({ firstName: 'Ana', lastName: 'Lima', birthYear: '1990', phone: '(11) 97777-6666', playerId: '100009' }))
      .toEqual({ firstName: 'Ana', lastName: 'Lima', birthYear: 1990, phone: '(11) 97777-6666', playerId: '100009' });
  });
});

describe('aviso ao jogador', () => {
  it('lista os campos alterados em português, na ordem do formulário', () => {
    expect(adminChangesText(['playerId', 'firstName', 'phone'])).toBe('O ADM da loja alterou seus dados: nome, telefone e Player ID.');
    expect(adminChangesText(['birthYear'])).toBe('O ADM da loja alterou seus dados: ano de nascimento.');
  });
});
