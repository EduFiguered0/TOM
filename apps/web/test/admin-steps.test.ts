import type { EventStatusDto } from '@tom/contracts';
import { describe, expect, it } from 'vitest';
import { eventSteps } from '../src/admin/steps.js';

describe('etapas do evento', () => {
  it('a etapa atual segue o status do evento', () => {
    const states = (s: EventStatusDto | null) => eventSteps(s).map((x) => x.state);
    expect(states(null)).toEqual(['now', 'todo', 'todo', 'todo']);
    expect(states('open')).toEqual(['done', 'now', 'todo', 'todo']);
    expect(states('running')).toEqual(['done', 'done', 'now', 'todo']);
    expect(states('final')).toEqual(['done', 'done', 'done', 'now']);
    expect(states('closed')).toEqual(['done', 'done', 'done', 'done']);
    expect(states('cancelled')).toEqual(['done', 'done', 'done', 'done']);
  });

  it('rótulos', () => {
    expect(eventSteps(null).map((x) => x.label)).toEqual(['Evento criado', 'Inscrições (QR)', 'Rodadas', 'Resultado final']);
  });
});
