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

const NEXT: Record<EventStatusDto, string | null> = {
  open: 'Próximo passo: lance os inscritos no TOM e gere o pareamento da rodada 1. O botão Iniciar rodada aparece na aba Rodada.',
  running: 'Entre rodadas: imprima a Classificação (ou o Registro de partida) no TOM para os resultados aparecerem na TV. O pareamento seguinte volta às mesas.',
  final: 'Resultado final recebido: confira e encerre o evento.',
  closed: null,
  cancelled: null,
};

/** O que o ADM faz agora, e onde (o site segue os arquivos do TOM). */
export const nextStep = (status: EventStatusDto): string | null => NEXT[status];
