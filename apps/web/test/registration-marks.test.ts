import { describe, expect, it } from 'vitest';
import { rowTone } from '../src/screens/registration-marks.js';

const r = (over: { accountId?: string; launched?: boolean; removed?: boolean } = {}) => ({ accountId: 'a1', launched: false, removed: false, ...over });

describe('cor da linha dos inscritos', () => {
  it('lançado no TOM: verde, mesmo depois de copiado', () => {
    expect(rowTone(r({ launched: true }), new Set(['a1']))).toBe('green');
  });

  it('Player ID copiado e ainda não lançado: laranja', () => {
    expect(rowTone(r(), new Set(['a1']))).toBe('orange');
  });

  it('sem marca, ou removido do evento: sem cor', () => {
    expect(rowTone(r(), new Set())).toBeNull();
    expect(rowTone(r({ removed: true, launched: true }), new Set(['a1']))).toBeNull();
  });
});
