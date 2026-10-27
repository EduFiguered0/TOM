import { describe, expect, it } from 'vitest';
import { preflight, type RepoState } from '../scripts/deploy-checks.js';

const ok: RepoState = { branch: 'main', dirty: false, behind: 0, ahead: 0, unreleased: 0 };

describe('conferências antes do deploy', () => {
  it('main limpa, igual ao GitHub e lançada: segue sem aviso', () => {
    expect(preflight(ok)).toEqual({ errors: [], warnings: [] });
  });

  it('fora da main, com alterações locais ou desatualizada: não faz deploy', () => {
    expect(preflight({ ...ok, branch: 'acrescimo' }).errors).toEqual(['Você está no branch "acrescimo": rode git switch main.']);
    expect(preflight({ ...ok, dirty: true }).errors).toEqual(['Há alterações locais não commitadas: o deploy sairia diferente do GitHub.']);
    expect(preflight({ ...ok, behind: 2 }).errors).toEqual(['A main local está 2 commit(s) atrás do GitHub: rode git pull.']);
    expect(preflight({ ...ok, ahead: 1 }).errors).toEqual(['A main local tem 1 commit(s) que não estão no GitHub.']);
  });

  it('mudanças ainda fora de uma release: só avisa', () => {
    expect(preflight({ ...ok, unreleased: 3 })).toEqual({
      errors: [],
      warnings: ['3 commit(s) depois da última release: o que vai ao ar ainda não tem versão (Actions → Release → Run workflow).'],
    });
  });
});
