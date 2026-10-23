import { toPlayerId, type PlayerId } from '@tom/core';
import { HTMLElement, NodeType } from 'node-html-parser';
import { TomParseError } from '../shared/errors.js';
import { generatedAt, int, load, required, roundOf, text } from '../shared/html.js';
import { parseRecord, type MatchRecord } from '../shared/record.js';

export interface SlipPlayer {
  playerId: PlayerId;
  name: string;
  division: string;
  record: MatchRecord;
}

export interface MatchSlip {
  tournament: string;
  round: number;
  table: number;
  player1: SlipPlayer;
  player2: SlipPlayer;
  keys: { player1Wins: string; player2Wins: string; tie: string };
}

export interface MatchSlipsReport {
  generatedAt: string;
  slips: MatchSlip[];
}

const ownText = (el: HTMLElement): string =>
  el.childNodes
    .filter((n) => n.nodeType === NodeType.TEXT_NODE)
    .map((n) => n.text)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

const key = (slip: HTMLElement, selector: string): string => {
  const value = required(slip, selector).getAttribute('data-barcode')?.trim() ?? '';
  if (!/^\d+$/.test(value)) throw new TomParseError(`Key inválida em ${selector}: "${value}"`);
  return value;
};

const player = (slip: HTMLElement, side: 1 | 2): SlipPlayer => {
  const details = required(slip, `.player-${String(side)}-win-details`);
  const spans = details.childNodes.filter((n) => n instanceof HTMLElement && n.tagName === 'SPAN');
  const id = /^(\d+)\s*-\s*(\S+)$/.exec(text(spans[1]));
  if (!id?.[1] || !id[2]) throw new TomParseError(`Player ID ausente no jogador ${String(side)}`);
  return {
    playerId: toPlayerId(id[1]),
    name: ownText(details),
    division: id[2],
    record: parseRecord(text(spans[0]?.childNodes[0])),
  };
};

const slip = (el: HTMLElement): MatchSlip => {
  const header = required(el, '.tied-info-details b');
  const table = /(\d+)$/.exec(text(required(el, '.player-1-info-details .heading')))?.[1] ?? '';
  return {
    tournament: text(header.childNodes[0]),
    round: roundOf(text(header)).round,
    table: int(table, 'Mesa'),
    player1: player(el, 1),
    player2: player(el, 2),
    keys: {
      player1Wins: key(el, '.player-1-barcode'),
      player2Wins: key(el, '.player-2-barcode'),
      tie: key(el, '.tie-barcode'),
    },
  };
};

export const parseMatchSlips = (html: string): MatchSlipsReport => {
  const root = load(html);
  return { generatedAt: generatedAt(root), slips: root.querySelectorAll('table.match_slip').map(slip) };
};
