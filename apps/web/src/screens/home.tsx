import type { MeResponse } from '@tom/contracts';
import type { Api } from '../api.js';
import { Checkin } from './checkin.js';
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
  <section class="card">
    <h1>Olá, {me.profile.name.split(' ')[0]}</h1>
    <p class="muted">{ROLE[me.role]} · {me.email}</p>
    {me.role === 'player' && (me.canAct ? (
      <p class="ok">Player ID {me.playerId?.value} confirmado. Você já pode reportar resultados.</p>
    ) : (
      <div class="notice">
        <p><b>Check-in pendente.</b> No primeiro evento, mostre este código ao ADM para confirmar o seu Player ID{me.playerId ? ` (${me.playerId.value})` : ''}:</p>
        <p class="code">{me.id}</p>
      </div>
    ))}
    {me.role !== 'player' && <p class="muted">Painel completo da organização (termômetro, override, keys) chega na fase 9.</p>}
    <button type="button" class="link" onClick={onSignOut}>Sair deste dispositivo</button>
  </section>
  {me.role === 'player' && me.canAct && <RoundCard api={api} />}
  {me.role === 'admin' && <StartRoundCard api={api} />}
  {me.role === 'admin' && <EventCard api={api} />}
  {me.role === 'admin' && <Checkin api={api} />}
  </>
);
