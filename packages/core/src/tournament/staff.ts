import type { Principal } from '../identity/account-service.js';
import type { Actor } from '../shared/actor.js';
import type { TournamentEvent } from './tournament-event.js';

/**
 * Quem age no painel do evento: o ADM sempre; o juiz só com a marca da equipe e escalado neste evento.
 * Tirar da equipe corta o poder na hora, mesmo com a escala mantida.
 */
export const staffActor = ({ account, actor }: Principal, event: TournamentEvent | null): Actor | null => {
  if (actor?.role === 'admin') return actor;
  if (account.judge === true && event?.judges.includes(account.id)) return { role: 'judge', accountId: account.id };
  return null;
};
