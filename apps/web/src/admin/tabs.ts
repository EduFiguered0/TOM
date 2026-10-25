export type AdminTab = 'evento' | 'rodada' | 'inscritos' | 'equipe' | 'jogadores';
export type StaffRole = 'admin' | 'judge';

/** Abas da área da organização; `/painel` continua sendo o endereço da rodada. */
export const ADMIN_TABS: readonly { tab: AdminTab; path: string; label: string }[] = [
  { tab: 'evento', path: '/conta', label: 'Evento' },
  { tab: 'rodada', path: '/painel', label: 'Rodada' },
  { tab: 'inscritos', path: '/conta/inscritos', label: 'Inscritos' },
  { tab: 'equipe', path: '/conta/equipe', label: 'Equipe' },
  { tab: 'jogadores', path: '/conta/jogadores', label: 'Jogadores' },
];

/** O juiz escalado só usa o painel da rodada. */
export const tabsFor = (role: StaffRole): AdminTab[] => (role === 'judge' ? ['rodada'] : ADMIN_TABS.map((t) => t.tab));

/** Aba do endereço; endereço desconhecido ou de outro papel cai na primeira aba do papel. */
export const tabFor = (pathname: string, role: StaffRole): AdminTab => {
  const allowed = tabsFor(role);
  const found = ADMIN_TABS.find((t) => t.path === pathname.replace(/\/+$/, '') && allowed.includes(t.tab));
  return found?.tab ?? (allowed[0] ?? 'rodada');
};
