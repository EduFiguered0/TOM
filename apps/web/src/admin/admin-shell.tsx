import type { MeResponse } from '@tom/contracts';
import { ExternalLink, LogOut } from 'lucide-preact';
import { useEffect, useState } from 'preact/hooks';
import type { Api } from '../api.js';
import { RoundTab } from '../panel/round-tab.js';
import { usePanel } from '../panel/use-panel.js';
import { STORE } from '../public/store.js';
import { RegistrationsTable, useRegistrations } from '../screens/registrations.js';
import { TeamCard } from '../screens/team.js';
import { UnlinkCard } from '../screens/unlink.js';
import { useTomFolder } from '../tom-folder/use-tom-folder.js';
import { EventTab } from './event-tab.js';
import { FolderDot } from './folder-box.js';
import { ADMIN_TABS, tabFor, tabsFor, type AdminTab, type StaffRole } from './tabs.js';
import { box, ghost, primary } from '../ui.js';
import { useActiveEvent } from './use-active-event.js';

interface Props {
  api: Api;
  me: MeResponse;
  onSignOut: () => void;
}

/**
 * Área do ADM no notebook: menu lateral, topo fixo e a aba aberta, sem rolar a página.
 * Trocar de aba não recarrega: a pasta do TOM (permissão pedida a cada carga) segue enviando.
 */
export const AdminShell = ({ api, me, onSignOut }: Props) => {
  const role: StaffRole = me.role === 'admin' ? 'admin' : 'judge';
  const [tab, setTab] = useState<AdminTab>(tabFor(location.pathname, role));
  const { event, reload } = useActiveEvent(api, role === 'admin');
  const panel = usePanel(api);
  const folder = useTomFolder(api, event ?? null);
  const registrations = useRegistrations(api, event?.id ?? null);

  useEffect(() => {
    const onPop = () => { setTab(tabFor(location.pathname, role)); };
    window.addEventListener('popstate', onPop);
    return () => { window.removeEventListener('popstate', onPop); };
  }, [role]);

  const go = (next: AdminTab) => {
    const path = ADMIN_TABS.find((t) => t.tab === next)?.path ?? '/conta';
    if (path !== location.pathname) history.pushState(null, '', path);
    setTab(next);
  };

  const count = registrations.data?.registrations.filter((r) => !r.removed).length;

  return (
    <div class="grid h-dvh grid-cols-[210px_1fr] overflow-hidden bg-bg text-text">
      <nav class="flex min-h-0 flex-col gap-1 border-r border-line bg-panel p-3" aria-label="Área do ADM">
        <a href="/" class="px-2 pb-3 text-base font-bold text-text no-underline">{STORE.name}</a>
        {tabsFor(role).map((t) => {
          const info = ADMIN_TABS.find((x) => x.tab === t);
          return (
            <a key={t} href={info?.path} aria-current={tab === t ? 'page' : undefined}
              class={`flex items-center justify-between rounded-md px-3 py-2 text-sm no-underline ${tab === t ? 'bg-accent/15 font-bold text-accent' : 'text-muted hover:text-text'}`}
              onClick={(e) => { e.preventDefault(); go(t); }}>
              {info?.label}
              {t === 'inscritos' && count !== undefined && <span class="text-xs text-muted">{count}</span>}
              {t === 'rodada' && panel.latest !== null && <span class="rounded-full bg-orange/15 px-2 text-xs font-bold text-orange">{panel.latest}</span>}
            </a>
          );
        })}
        <div class="mt-auto border-t border-line px-2 pt-3 text-xs">
          <div class="font-bold text-text">{me.profile.name.split(' ')[0]} · {role === 'admin' ? 'ADM' : 'Juiz'}</div>
          <div class="truncate text-muted">{me.email}</div>
          <button type="button" class="mt-2 flex cursor-pointer items-center gap-1 bg-transparent p-0 text-xs text-accent hover:underline" onClick={onSignOut}>
            <LogOut size={14} aria-hidden="true" />Sair deste dispositivo
          </button>
        </div>
      </nav>

      <div class="flex min-h-0 flex-col">
        <header class="flex items-center gap-3 border-b border-line bg-panel px-5 py-3">
          <div class="min-w-0">
            <div class="truncate text-base font-bold">{event?.label ?? panel.data?.round?.tournament ?? (role === 'admin' ? 'Nenhum evento ativo' : 'Painel do juiz')}</div>
            {event && <div class="text-xs text-muted">{event.date.split('-').reverse().join('/')}</div>}
          </div>
          <div class="flex-1" />
          {role === 'admin' && <FolderDot state={folder.state} />}
          <a href="/tv" target="_blank" rel="noopener" class={`${ghost} flex items-center gap-1 no-underline`}>
            Abrir TV<ExternalLink size={14} aria-hidden="true" />
          </a>
          {tab === 'evento' && event && (event.status === 'confirming' || event.status === 'running') && (
            <button type="button" class={primary} onClick={() => { go('rodada'); }}>Ir para a rodada</button>
          )}
        </header>

        <main class="flex min-h-0 flex-1 flex-col p-5">
          {event === undefined && tab !== 'rodada' && <p class="m-0 text-sm text-muted">Carregando…</p>}
          {event !== undefined && tab === 'evento' && (
            <EventTab api={api} event={event} reload={reload} folder={folder} registrations={registrations} onTeam={() => { go('equipe'); }} />
          )}
          {tab === 'rodada' && <RoundTab api={api} admin={role === 'admin'} panel={panel} />}
          {event !== undefined && tab === 'inscritos' && (event
            ? <section class={`${box} flex-1`} aria-label="Inscritos"><RegistrationsTable api={api} event={event} registrations={registrations} /></section>
            : <p class="m-0 text-sm text-muted">Sem evento ativo.</p>)}
          {tab === 'equipe' && <TeamCard api={api} />}
          {tab === 'jogadores' && <UnlinkCard api={api} />}
        </main>
      </div>
    </div>
  );
};
