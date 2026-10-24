import type { MeResponse } from '@tom/contracts';
import type { Api } from '../api.js';
import { EventCard } from './event.js';
import { RoundCard } from '../round/round-card.js';
import { StartRoundCard } from '../round/start-card.js';

interface Props {
  me: MeResponse;
  api: Api;
  onSignOut: () => void;
}

const ROLE: Record<MeResponse['role'], string> = { player: 'Jogador', judge: 'Juiz', admin: 'ADM' };

export const Home = ({ me, api, onSignOut }: Props) => (
  <>
  {/* No salão o que importa é a mesa: a rodada vem primeiro. */}
  {me.role === 'player' && me.canAct && <RoundCard api={api} />}
  <section class="card">
    <h1>Olá, {me.profile.name.split(' ')[0]}</h1>
    <p class="muted">{ROLE[me.role]} · {me.email}</p>
    {me.role === 'player' && (me.canAct ? (
      <p class="ok">Player ID {me.playerId}. Você já pode reportar resultados.</p>
    ) : (
      <div class="notice">
        <p><b>Check-in pendente.</b> No primeiro evento, mostre este código ao ADM para confirmar o seu Player ID{me.playerId ? ` (${me.playerId})` : ''}:</p>
        <p class="code">{me.id}</p>
      </div>
    ))}
    {me.role !== 'player' && <a class="button" href="/painel">Abrir o painel da rodada</a>}
    <button type="button" class="link" onClick={onSignOut}>Sair deste dispositivo</button>
  </section>
  {me.role === 'admin' && <StartRoundCard api={api} />}
  {me.role === 'admin' && <EventCard api={api} />}
  </>
);
