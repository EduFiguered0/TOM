import { describe, expect, it } from 'vitest';
import { ADMIN_TABS, tabFor, tabsFor } from '../src/admin/tabs.js';

describe('abas do ADM', () => {
  it('cada caminho abre a sua aba; desconhecido cai na primeira do papel', () => {
    expect(tabFor('/conta', 'admin')).toBe('evento');
    expect(tabFor('/painel', 'admin')).toBe('rodada');
    expect(tabFor('/conta/equipe', 'admin')).toBe('equipe');
    expect(tabFor('/conta/xyz', 'admin')).toBe('evento');
    expect(tabFor('/conta', 'judge')).toBe('rodada');
  });

  it('juiz só tem a aba Rodada', () => {
    expect(tabsFor('judge')).toEqual(['rodada']);
    expect(tabsFor('admin')).toEqual(['evento', 'rodada', 'inscritos', 'equipe', 'jogadores']);
  });

  it('caminhos das abas', () => {
    expect(ADMIN_TABS.map((t) => t.path)).toEqual(['/conta', '/painel', '/conta/inscritos', '/conta/equipe', '/conta/jogadores']);
  });
});
