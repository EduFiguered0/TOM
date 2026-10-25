import type { EventStatusDto } from '@tom/contracts';

export type StepState = 'done' | 'now' | 'todo';

const LABELS = ['Evento criado', 'Inscrições (QR)', 'Confirmação', 'Rodadas', 'Resultado final'] as const;

/** Etapa em andamento: sem evento, a primeira (criar); encerrado ou cancelado, todas feitas. */
const CURRENT: Record<EventStatusDto, number> = { open: 1, confirming: 2, running: 3, final: 4, closed: 5, cancelled: 5 };

/** Faixa de etapas da aba Evento. */
export const eventSteps = (status: EventStatusDto | null): { label: string; state: StepState }[] => {
  const now = status ? CURRENT[status] : 0;
  return LABELS.map((label, i) => ({ label, state: i < now ? 'done' : i === now ? 'now' : 'todo' }));
};
