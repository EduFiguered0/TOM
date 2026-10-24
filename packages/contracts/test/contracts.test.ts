import { describe, expect, it } from 'vitest';
import {
  InvalidRequestError,
  parseCreateEventRequest,
  parseJudgesRequest,
  parsePlayerIdRequest,
  parseRegisterRequest,
  parseSearchRequest,
  parseSessionRequest,
  parseSetJudgeRequest,
} from '../src/index.js';

const valid = { profile: { name: 'Ana', birthYear: 1990, phone: null, guardianConsent: false }, playerId: '100001' };

describe('contratos da API', () => {
  it('aceita cadastro válido e ignora campos extras (o e-mail nunca vem do corpo)', () => {
    expect(parseRegisterRequest({ ...valid, email: 'forjado@example.com' })).toEqual(valid);
  });

  it.each([
    ['corpo não objeto', null],
    ['perfil ausente', { playerId: null }],
    ['ano como texto', { ...valid, profile: { ...valid.profile, birthYear: '1990' } }],
    ['consentimento ausente', { ...valid, profile: { name: 'Ana', birthYear: 1990, phone: null } }],
    ['Player ID numérico', { ...valid, playerId: 100001 }],
  ])('recusa cadastro com %s', (_, body) => {
    expect(() => parseRegisterRequest(body)).toThrow(InvalidRequestError);
  });

  it('confirmação exige Player ID em texto', () => {
    expect(parsePlayerIdRequest({ playerId: '100001' })).toEqual({ playerId: '100001' });
    expect(() => parsePlayerIdRequest({ playerId: 100001 })).toThrow(InvalidRequestError);
  });

  it('sessão exige replace booleano', () => {
    expect(parseSessionRequest({ replace: true })).toEqual({ replace: true });
    expect(() => parseSessionRequest({ replace: 'sim' })).toThrow(InvalidRequestError);
  });
});

describe('equipe e escala', () => {
  it('busca, marca de juiz e escala: formato e limites', () => {
    expect(parseSearchRequest({ query: 'joao' })).toEqual({ query: 'joao' });
    expect(() => parseSearchRequest({})).toThrow(InvalidRequestError);
    expect(parseSetJudgeRequest({ judge: true })).toEqual({ judge: true });
    expect(() => parseSetJudgeRequest({ judge: 'sim' })).toThrow(InvalidRequestError);
    expect(parseJudgesRequest({ judges: ['a', 'b'] })).toEqual({ judges: ['a', 'b'] });
    expect(() => parseJudgesRequest({ judges: [1] })).toThrow(InvalidRequestError);
    expect(() => parseJudgesRequest({ judges: Array.from({ length: 21 }, (_, i) => String(i)) })).toThrow(InvalidRequestError);
    expect(parseCreateEventRequest({ label: 'Liga' })).toEqual({ label: 'Liga', judges: [] });
    expect(parseCreateEventRequest({ label: 'Liga', judges: ['a'] })).toEqual({ label: 'Liga', judges: ['a'] });
  });
});
