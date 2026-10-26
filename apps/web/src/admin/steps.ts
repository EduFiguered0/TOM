import type { EventStatusDto } from '@tom/contracts';

export type StepState = 'done' | 'now' | 'todo';

const LABELS = ['Evento criado', 'Inscrições (QR)', 'Rodadas', 'Resultado final'] as const;

/** Etapa em andamento: sem evento, a primeira (criar); encerrado ou cancelado, todas feitas. */
const CURRENT: Record<EventStatusDto, number> = { open: 1, running: 2, final: 3, closed: 4, cancelled: 4 };

/** Faixa de etapas da aba Evento. */
export const eventSteps = (status: EventStatusDto | null): { label: string; state: StepState }[] => {
  const now = status ? CURRENT[status] : 0;
  return LABELS.map((label, i) => ({ label, state: i < now ? 'done' : i === now ? 'now' : 'todo' }));
};
