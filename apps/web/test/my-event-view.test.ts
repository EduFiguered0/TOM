import type { EventStatusDto, MyEventResponse, RegistrationDto } from '@tom/contracts';
import { describe, expect, it } from 'vitest';
import { myEventView } from '../src/screens/my-event-view.js';

const mine = (status: EventStatusDto, registration: Partial<RegistrationDto> | null, placement: MyEventResponse['placement'] = null): MyEventResponse => ({
  event: { id: 'ev', label: 'Liga', date: '2026-10-26', roundMinutes: 50, status, judges: [] },
  registration: registration && {
    accountId: 'a1', playerId: '100001', firstName: 'Ana', lastName: 'Souza', birthYear: 1990, at: '2026-10-26T13:00:00.000Z', by: 'self',
    awaitingApproval: false, launched: false, removed: false, inRound: null, ...registration,
  },
  placement,
});

describe('cartão do evento do dia', () => {
  it('aguardando aprovação aparece mesmo com a rodada em andamento', () => {
    expect(myEventView(mine('running', { awaitingApproval: true }))).toBe('awaiting');
  });

  it('aprovado com a rodada em andamento: o cartão some (a rodada assume)', () => {
    expect(myEventView(mine('running', {}))).toBe('none');
  });

  it('inscrito antes da rodada 1 espera o início', () => {
    expect(myEventView(mine('open', {}))).toBe('waiting-start');
  });

  it('removido (ou recusado) vê o aviso, em qualquer fase', () => {
    expect(myEventView(mine('running', { removed: true, awaitingApproval: true }))).toBe('removed');
  });

  it('nunca aprovado e o evento acabou: encerrado, não "aguardando"', () => {
    expect(myEventView(mine('final', { awaitingApproval: true }))).toBe('ended');
    expect(myEventView(mine('closed', { awaitingApproval: true }))).toBe('ended');
  });

  it('resultado: colocação ou evento encerrado', () => {
    expect(myEventView(mine('final', {}, { rank: 2, total: 5, wins: 2, losses: 1, ties: 0, points: 6 }))).toBe('placement');
    expect(myEventView(mine('closed', {}))).toBe('ended');
  });

  it('sem evento ou sem inscrição: nada', () => {
    expect(myEventView({ event: null, registration: null, placement: null })).toBe('none');
    expect(myEventView(mine('open', null))).toBe('none');
  });
});
