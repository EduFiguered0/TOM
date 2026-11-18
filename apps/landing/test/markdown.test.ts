import { describe, expect, it } from 'vitest';
import { renderLegal } from '../src/markdown.js';

describe('texto dos termos', () => {
  it('títulos, parágrafos e listas; HTML fica como texto', () => {
    expect(renderLegal('# T\n\nParágrafo <b>x</b>\ncontinua\n\n## S\n\n- item 1\n- item 2')).toEqual([
      { kind: 'h1', text: 'T' },
      { kind: 'p', text: 'Parágrafo <b>x</b> continua' },
      { kind: 'h2', text: 'S' },
      { kind: 'li', text: 'item 1' },
      { kind: 'li', text: 'item 2' },
    ]);
  });
});
