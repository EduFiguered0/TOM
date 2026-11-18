import { describe, expect, expectTypeOf, it } from 'vitest';
import { InvalidLeadError, statusOf, validProfile, type ProfileInput } from '../src/lead.js';

const now = new Date('2026-11-17T12:00:00Z');
const valid: ProfileInput = { fullName: '  Ana  Souza ', phone: '(21) 99876-5432', birthDate: '2000-05-10', acceptTerms: true, marketingOptIn: false };

const fieldOf = (input: Partial<ProfileInput>) => {
  try {
    validProfile({ ...valid, ...input }, now);
  } catch (error) {
    if (error instanceof InvalidLeadError) return error.field;
    throw error;
  }
  return null;
};

describe('cadastro complementar', () => {
  it('normaliza nome e telefone', () => {
    expect(validProfile(valid, now)).toEqual({ fullName: 'Ana Souza', phone: '21998765432', birthDate: '2000-05-10', marketingOptIn: false });
  });

  it('aceita telefone fixo com DDD', () => {
    expect(validProfile({ ...valid, phone: '2132345678' }, now).phone).toBe('2132345678');
  });

  it.each([
    ['', 'phone'],
    ['21898765432', 'phone'],
    ['0198765432', 'phone'],
  ])('recusa o telefone %j', (phone, field) => {
    expect(fieldOf({ phone })).toBe(field);
  });

  it.each(['', '2030-01-01', '2000-02-30', '10/05/2000'])('recusa a data de nascimento %j', (birthDate) => {
    expect(fieldOf({ birthDate })).toBe('birthDate');
  });

  it('recusa menor de 12 anos (LGPD, art. 14)', () => {
    expect(fieldOf({ birthDate: '2015-01-01' })).toBe('birthDate');
    expect(fieldOf({ birthDate: '2014-11-17' })).toBeNull();
  });

  it('recusa nome de uma palavra só', () => {
    expect(fieldOf({ fullName: 'Ana' })).toBe('fullName');
  });

  it('exige o aceite dos termos', () => {
    expect(fieldOf({ acceptTerms: false })).toBe('acceptTerms');
  });

  it('não pede CPF', () => {
    expectTypeOf<ProfileInput>().not.toHaveProperty('cpf');
    expect(Object.keys(validProfile(valid, now))).not.toContain('cpf');
  });

  it('completo só com telefone e data de nascimento', () => {
    expect(statusOf({ fullName: 'Ana Souza', phone: null, birthDate: '2000-05-10' })).toBe('INCOMPLETE');
    expect(statusOf({ fullName: 'Ana Souza', phone: '21998765432', birthDate: null })).toBe('INCOMPLETE');
    expect(statusOf({ fullName: 'Ana Souza', phone: '21998765432', birthDate: '2000-05-10' })).toBe('COMPLETE');
  });
});
