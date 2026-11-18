import { describe, expect, it } from 'vitest';
import { cleanUtm } from '../src/utm.js';

describe('origem do acesso (UTM)', () => {
  it('sem UTM é acesso direto', () => {
    expect(cleanUtm({})).toEqual({ source: 'direct', medium: null, campaign: null, content: null });
  });

  it('minúsculas e só caracteres seguros', () => {
    expect(cleanUtm({ utm_source: ' Instagram ', utm_campaign: 'OTS<script>' })).toMatchObject({ source: 'instagram', campaign: 'otsscript' });
  });

  it('corta em 64 caracteres e ignora o que não é texto', () => {
    expect(cleanUtm({ utm_source: 'a'.repeat(5000) }).source).toHaveLength(64);
    expect(cleanUtm({ utm_source: { x: 1 }, utm_medium: '🔥' })).toMatchObject({ source: 'direct', medium: null });
  });
});
