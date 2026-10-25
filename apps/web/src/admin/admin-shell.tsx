import type { MeResponse } from '@tom/contracts';
import { ExternalLink, LogOut } from 'lucide-preact';
import { useEffect, useState } from 'preact/hooks';
import type { Api } from '../api.js';
import { PanelScreen } from '../panel/panel-screen.js';
import { STORE } from '../public/store.js';
import { RegistrationsTable, useRegistrations } from '../screens/registrations.js';
import { TeamCard } from '../screens/team.js';
import { UnlinkCard } from '../screens/unlink.js';
import { useTomFolder } from '../tom-folder/use-tom-folder.js';
import { EventTab } from './event-tab.js';
import { FolderDot } from './folder-box.js';
import { ADMIN_TABS, tabFor, tabsFor, type AdminTab } from './tabs.js';
import { box, ghost, primary } from './ui.js';
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
  const [tab, setTab] = useState<AdminTab>(tabFor(location.pathname, 'admin'));
  const { event, reload } = useActiveEvent(api);
  const folder = useTomFolder(api, event ?? null);
  const registrations = useRegistrations(api, event?.id ?? null);

  useEffect(() => {
    const onPop = () => { setTab(tabFor(location.pathname, 'admin')); };
    window.addEventListener('popstate', onPop);
    return () => { window.removeEventListener('popstate', onPop); };
  }, []);

  const go = (next: AdminTab) => {
    const path = ADMIN_TABS.find((t) => t.tab === next)?.path ?? '/conta';
    if (path !== location.pathname) history.pushState(null, '', path);
    setTab(next);
  };

  const count = registrations.data?.registrations.filter((r) => !r.removed).length;
  const legacy = 'legacy min-h-0 flex-1 overflow-y-auto';

  return (
    <div class="grid h-dvh grid-cols-[210px_1fr] overflow-hidden bg-bg text-text">
      <nav class="flex min-h-0 flex-col gap-1 border-r border-line bg-panel p-3" aria-label="Área do ADM">
        <a href="/" class="px-2 pb-3 text-base font-bold text-text no-underline">{STORE.name}</a>
        {tabsFor('admin').map((t) => {
          const info = ADMIN_TABS.find((x) => x.tab === t);
          return (
            <a key={t} href={info?.path} aria-current={tab === t ? 'page' : undefined}
              class={`flex items-center justify-between rounded-md px-3 py-2 text-sm no-underline ${tab === t ? 'bg-accent/15 font-bold text-accent' : 'text-muted hover:text-text'}`}
              onClick={(e) => { e.preventDefault(); go(t); }}>
              {info?.label}
              {t === 'inscritos' && count !== undefined && <span class="text-xs text-muted">{count}</span>}
            </a>
          );
        })}
        <div class="mt-auto border-t border-line px-2 pt-3 text-xs">
          <div class="font-bold text-text">{me.profile.name.split(' ')[0]} · ADM</div>
          <div class="truncate text-muted">{me.email}</div>
          <button type="button" class="mt-2 flex cursor-pointer items-center gap-1 bg-transparent p-0 text-xs text-accent hover:underline" onClick={onSignOut}>
            <LogOut size={14} aria-hidden="true" />Sair deste dispositivo
          </button>
        </div>
      </nav>

      <div class="flex min-h-0 flex-col">
        <header class="flex items-center gap-3 border-b border-line bg-panel px-5 py-3">
          <div class="min-w-0">
            <div class="truncate text-base font-bold">{event?.label ?? 'Nenhum evento ativo'}</div>
            {event && <div class="text-xs text-muted">{event.date.split('-').reverse().join('/')}</div>}
          </div>
          <div class="flex-1" />
          <FolderDot state={folder.state} />
          <a href="/tv" target="_blank" rel="noopener" class={`${ghost} flex items-center gap-1 no-underline`}>
            Abrir TV<ExternalLink size={14} aria-hidden="true" />
          </a>
          {tab === 'evento' && event && (event.status === 'confirming' || event.status === 'running') && (
            <button type="button" class={primary} onClick={() => { go('rodada'); }}>Ir para a rodada</button>
          )}
        </header>

        <main class="flex min-h-0 flex-1 flex-col p-5">
          {event === undefined && <p class="m-0 text-sm text-muted">Carregando…</p>}
          {event !== undefined && tab === 'evento' && (
            <EventTab api={api} event={event} reload={reload} folder={folder} registrations={registrations} onTeam={() => { go('equipe'); }} />
          )}
          {tab === 'rodada' && <div class={legacy}><PanelScreen api={api} me={me} embedded /></div>}
          {event !== undefined && tab === 'inscritos' && (event
            ? <section class={`${box} flex-1`} aria-label="Inscritos"><RegistrationsTable api={api} event={event} registrations={registrations} /></section>
            : <p class="m-0 text-sm text-muted">Sem evento ativo.</p>)}
          {tab === 'equipe' && <div class={`${legacy} max-w-xl`}><TeamCard api={api} /></div>}
          {tab === 'jogadores' && <div class={`${legacy} max-w-xl`}><UnlinkCard api={api} /></div>}
        </main>
      </div>
    </div>
  );
};
