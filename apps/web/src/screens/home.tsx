import type { MeResponse } from '@tom/contracts';
import type { Api } from '../api.js';
import { EventPanel } from './event-panel.js';
import { MyEventCard } from './my-event.js';
import { PlayerIdCard } from './player-id.js';
import { TeamCard } from './team.js';
import { UnlinkCard } from './unlink.js';
import { RoundCard } from '../round/round-card.js';
import { StartRoundCard } from '../round/start-card.js';

interface Props {
  me: MeResponse;
  api: Api;
  onSignOut: () => void;
  /** A conta mudou (ex.: informou o Player ID). */
  onChanged: (me: MeResponse) => void;
  /** Falha ao inscrever pelo QR (inscrições encerradas, juiz do evento...). */
  joinError: string | null;
  /** Muda quando a inscrição pelo QR terminou: o evento do dia recarrega. */
  eventRefresh: number;
}

const ROLE: Record<MeResponse['role'], string> = { player: 'Jogador', admin: 'ADM' };

export const Home = ({ me, api, onSignOut, onChanged, joinError, eventRefresh }: Props) => (
  <>
  {joinError && <section class="card warn"><p class="error" role="alert">{joinError}</p></section>}
  {me.role === 'player' && <MyEventCard api={api} refresh={eventRefresh} />}
  {/* No salão o que importa é a mesa: a rodada vem primeiro. */}
  {me.role === 'player' && me.canAct && <RoundCard api={api} />}
  <section class="card">
    <h1>Olá, {me.profile.name.split(' ')[0]}</h1>
    <p class="muted">{ROLE[me.role]} · {me.email}</p>
    {me.role === 'player' && (me.playerId
      ? <p class="ok">Player ID {me.playerId}. {me.judging ? 'Você é juiz deste evento.' : 'Você já pode reportar resultados.'}</p>
      : <PlayerIdCard api={api} onSaved={onChanged} />)}
    {me.role === 'admin' && <a class="button" href="/painel">Abrir o painel da rodada</a>}
    <button type="button" class="link" onClick={onSignOut}>Sair deste dispositivo</button>
  </section>
  {me.judge && (
    <section class="card">
      <h2>Juiz</h2>
      {me.judging
        ? <a class="button" href="/painel">Abrir o painel da rodada</a>
        : <p class="muted">Você não está escalado no evento atual.</p>}
    </section>
  )}
  {me.role === 'admin' && <StartRoundCard api={api} />}
  {me.role === 'admin' && <EventPanel api={api} />}
  {me.role === 'admin' && <TeamCard api={api} />}
  {me.role === 'admin' && <UnlinkCard api={api} />}
  </>
);
