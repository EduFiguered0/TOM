import { parse, type HTMLElement } from 'node-html-parser';
import { TomParseError } from './errors.js';

export const load = (html: string): HTMLElement => parse(html);

export const text = (el: { text: string } | null | undefined): string =>
  (el?.text ?? '').replace(/\s+/g, ' ').trim();

export const required = (root: HTMLElement, selector: string): HTMLElement => {
  const el = root.querySelector(selector);
  if (!el) throw new TomParseError(`Elemento ausente: ${selector}`);
  return el;
};

export const int = (value: string, field: string): number => {
  if (!/^\d+$/.test(value)) throw new TomParseError(`${field} inválido: "${value}"`);
  return Number(value);
};

export const generatedAt = (root: HTMLElement): string => {
  const match = /(\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2})$/.exec(text(root.querySelector('title')));
  if (!match?.[1]) throw new TomParseError('Data de geração ausente no título');
  return match[1];
};

export const footerTournament = (root: HTMLElement): string => {
  const name = text(root.querySelector('table.footer td'));
  if (!name) throw new TomParseError('Nome do torneio ausente no rodapé');
  return name;
};

/** Lê "Rodada 3" ou "Rodada 2/3" pelo número no fim, sem depender do idioma. */
export const roundOf = (heading: string): { round: number; totalRounds: number | null } => {
  const match = /(\d+)(?:\/(\d+))?$/.exec(heading.trim());
  if (!match?.[1]) throw new TomParseError(`Rodada ausente em "${heading}"`);
  return { round: Number(match[1]), totalRounds: match[2] ? Number(match[2]) : null };
};

/** Cada tabela de dados vem precedida pelo cabeçalho da divisão (h2/h3). */
export const divisionTables = (
  root: HTMLElement,
  selector: string,
): { division: string; rows: HTMLElement[][] }[] =>
  root.querySelectorAll(selector).map((table) => {
    let prev = table.previousElementSibling;
    while (prev && !/^H[23]$/.test(prev.tagName)) prev = prev.previousElementSibling;
    if (!prev) throw new TomParseError('Tabela sem cabeçalho de divisão');
    const rows = table
      .querySelectorAll('tr')
      .map((tr) => tr.querySelectorAll('td'))
      .filter((cells) => cells.length > 0);
    return { division: text(prev).replace(/\s+--.*$/, ''), rows };
  });

export const expectCells = (cells: HTMLElement[], count: number, report: string): string[] => {
  if (cells.length !== count) {
    throw new TomParseError(`${report}: esperado ${String(count)} colunas, veio ${String(cells.length)}`);
  }
  return cells.map((c) => text(c));
};
