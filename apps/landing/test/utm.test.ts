import { describe, expect, it } from 'vitest';
import { captureUtm } from '../src/utm.js';

const memory = () => {
  const store = { value: null as string | null, get: () => store.value, set: (v: string) => { store.value = v; } };
  return store;
};

describe('origem do acesso no navegador', () => {
  it('URL com UTM: limpa e guarda', () => {
    const store = memory();
    expect(captureUtm('?utm_source=Instagram&utm_campaign=OTS', store)).toEqual({ source: 'instagram', medium: null, campaign: 'ots', content: null });
    expect(store.value).not.toBeNull();
  });

  it('volta do Google sem UTM: usa a origem guardada antes do login', () => {
    const store = memory();
    captureUtm('?utm_source=instagram', store);
    expect(captureUtm('?code=abc&state=x', store).source).toBe('instagram');
  });

  it('nada na URL nem guardado: acesso direto', () => {
    expect(captureUtm('', memory()).source).toBe('direct');
  });

  it('valor guardado corrompido não quebra', () => {
    const store = memory();
    store.value = '{x';
    expect(captureUtm('', store).source).toBe('direct');
  });
});
