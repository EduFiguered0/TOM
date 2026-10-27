import type { EventStatusDto } from '@tom/contracts';
import { describe, expect, it } from 'vitest';
import { eventSteps, nextStep } from '../src/admin/steps.js';

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

  it('próximo passo diz onde agir', () => {
    expect(nextStep('open')).toBe('Próximo passo: lance os inscritos no TOM e gere o pareamento da rodada 1. O botão Iniciar rodada aparece na aba Rodada.');
    expect(nextStep('running')).toBe('Entre rodadas: imprima a Classificação no TOM (não o Registro de partida) para ela aparecer na TV. O pareamento seguinte volta às mesas.');
    expect(nextStep('final')).toBe('Resultado final recebido: confira e encerre o evento.');
    expect(nextStep('closed')).toBeNull();
    expect(nextStep('cancelled')).toBeNull();
  });
});
