import type { PlayerId } from './player-id.js';

/** Quem executa a ação; vai gravado em cada evento. */
export type Actor =
  | { role: 'player'; accountId: string; playerId: PlayerId }
  | { role: 'judge' | 'admin'; accountId: string }
  | { role: 'system'; source: string };

export type Role = Actor['role'];
