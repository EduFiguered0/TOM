import type { MyEventResponse } from '@tom/contracts';

export type MyEventView = 'none' | 'awaiting' | 'removed' | 'placement' | 'ended' | 'waiting-start';

/** O que o cartão do evento do dia mostra. Com a rodada em andamento some, a menos que a entrada espere o ADM. */
export const myEventView = ({ event, registration, placement }: MyEventResponse): MyEventView => {
  if (!event || !registration) return 'none';
  if (registration.removed) return 'removed';
  if (registration.awaitingApproval && event.status === 'running') return 'awaiting';
  if (placement) return 'placement';
  if (event.status === 'final' || event.status === 'closed') return 'ended';
  if (event.status === 'running') return 'none';
  return 'waiting-start';
};
