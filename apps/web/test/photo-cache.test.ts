import { describe, expect, it } from 'vitest';
import { createPhotoCache, initials } from '../src/photo/photo-cache.js';

describe('cache das fotos', () => {
  it('cada chave é buscada uma vez; falha não fica guardada', async () => {
    const calls: string[] = [];
    let fail = true;
    const cache = createPhotoCache((id) => {
      calls.push(id);
      if (id === 'b' && fail) { fail = false; return Promise.reject(new Error('rede')); }
      return Promise.resolve(`data:${id}`);
    });
    expect(await Promise.all([cache.get('a'), cache.get('a')])).toEqual(['data:a', 'data:a']);
    await expect(cache.get('b')).rejects.toThrow('rede');
    expect(await cache.get('b')).toBe('data:b');
    expect(calls).toEqual(['a', 'b', 'b']);
  });
});

describe('avatar genérico', () => {
  it('iniciais do nome', () => {
    expect(initials('Ana Souza')).toBe('AS');
    expect(initials('madonna')).toBe('M');
    expect(initials('  ')).toBe('?');
  });
});
