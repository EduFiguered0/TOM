import type { MeResponse } from '@tom/contracts';
import type { Api } from '../api.js';
import { card, cardWarn, Feedback, muted, textButton, title } from '../ui.js';
import { MyEventCard } from './my-event.js';
import { NameReviewCard } from './name-review.js';
import { PhotoCard } from './photo-card.js';
import { PlayerIdCard } from './player-id.js';
import { RoundCard } from '../round/round-card.js';

interface Props {
  me: MeResponse;
  api: Api;
  onSignOut: () => void;
  /** A conta mudou (ex.: informou o Player ID). */
  onChanged: (me: MeResponse) => void;
  /** Falha ao inscrever pelo QR (inscrições encerradas, juiz do evento...). */
  joinError: string | null;
  /** Resultado do convite de juiz escaneado. */
  notice?: { ok: boolean; text: string } | null;
  /** Muda quando a inscrição pelo QR terminou: o evento do dia recarrega. */
  eventRefresh: number;
}

const ROLE: Record<MeResponse['role'], string> = { player: 'Jogador', admin: 'ADM' };

export const Home = ({ me, api, onSignOut, onChanged, joinError, eventRefresh, notice = null }: Props) => (
  <>
  {joinError && <section class={cardWarn}><p class="m-0 font-medium text-error" role="alert">{joinError}</p></section>}
  {notice && <section class={notice.ok ? card : cardWarn}><Feedback message={notice} /></section>}
  {me.role === 'player' && <MyEventCard api={api} refresh={eventRefresh} />}
  {/* No salão o que importa é a mesa: a rodada vem primeiro. */}
  {me.role === 'player' && me.canAct && <RoundCard api={api} me={{ photo: me.photo, name: `${me.profile.firstName} ${me.profile.lastName}` }} />}
  <section class={card}>
    <h1 class={title}>Olá, {me.profile.firstName}</h1>
    <p class={muted}>{ROLE[me.role]} · {me.email}</p>
    {!me.nameReviewed && <NameReviewCard me={me} api={api} onSaved={onChanged} />}
    {me.role === 'player' && (me.playerId
      ? <p class="m-0 font-medium text-ok">Player ID {me.playerId}. {me.judging ? 'Você é juiz deste evento.' : 'Você já pode reportar resultados.'}</p>
      : <PlayerIdCard api={api} onSaved={onChanged} />)}
    {me.role === 'player' && <PhotoCard me={me} api={api} onSaved={onChanged} />}
    {me.judge && <p class={muted}>Juiz da equipe. Você não está escalado no evento atual.</p>}
    <button type="button" class={textButton} onClick={onSignOut}>Sair deste dispositivo</button>
  </section>
  </>
);
