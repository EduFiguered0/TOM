import { describe, expect, it } from 'vitest';
import { joinUrl, pages, qrPath, roundClock } from '../src/tv/board.js';

const endsAt = '2026-10-24T15:30:00.000Z';
const at = (iso: string) => Date.parse(iso);

describe('cronômetro da TV', () => {
  it('antes de iniciar a rodada', () => {
    expect(roundClock({ endsAt: null }, at('2026-10-24T15:00:00Z'), 0)).toEqual({ state: 'waiting' });
  });

  it('conta o tempo restante e avisa nos últimos 5 minutos', () => {
    expect(roundClock({ endsAt }, at('2026-10-24T15:17:30.200Z'), 0)).toEqual({ state: 'running', text: '12:30', warning: false });
    expect(roundClock({ endsAt }, at('2026-10-24T15:25:00Z'), 0)).toEqual({ state: 'running', text: '05:00', warning: true });
  });

  it('usa o relógio do servidor mesmo com a TV adiantada ou atrasada', () => {
    // TV 2 minutos atrasada: o servidor está 120 s à frente.
    expect(roundClock({ endsAt }, at('2026-10-24T15:20:00Z'), 120_000)).toMatchObject({ text: '08:00' });
  });

  it('tempo esgotado', () => {
    expect(roundClock({ endsAt }, at('2026-10-24T15:30:00Z'), 0)).toEqual({ state: 'over' });
  });
});

describe('páginas da TV', () => {
  it('divide as mesas e nunca devolve lista vazia de páginas', () => {
    expect(pages([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(pages([], 20)).toEqual([[]]);
  });
});

describe('QR da TV', () => {
  it('cada módulo escuro vira um quadrado no caminho do SVG (sem innerHTML)', () => {
    expect(qrPath([[true, false], [false, true]])).toBe('M0 0h1v1h-1zM1 1h1v1h-1z');
    expect(qrPath([[false]])).toBe('');
  });

  it('endereço do QR: o site + /e/<código>', () => {
    expect(joinUrl('https://dvaep2eni3fqm.cloudfront.net', 'ABCD2345')).toBe('https://dvaep2eni3fqm.cloudfront.net/e/ABCD2345');
  });
});
