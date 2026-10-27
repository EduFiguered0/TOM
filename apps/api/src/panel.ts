import type { PanelResponse, PanelTable, TableColor } from '@tom/contracts';
import { tomKeyFor, type Actor, type RoundState, type TableState, type TomKey } from '@tom/core';

const actorLabel = (actor: Actor) => (actor.role === 'system' ? actor.source : `${actor.role}:${actor.accountId}`);

const keyLabel = (key: TomKey, table: TableState) =>
  key === 'tie' ? 'Empate' : `Vitória de ${key === 'player1Wins' ? table.player1.name : table.player2.name}`;

const toPanelTable = (t: TableState): PanelTable => {
  const key = t.status.color === 'green' ? tomKeyFor(t.status.result) : null;
  return {
    table: t.table,
    player1: { name: t.player1.name, playerId: t.player1.playerId },
    player2: { name: t.player2.name, playerId: t.player2.playerId },
    color: t.status.color,
    redReason: t.status.color === 'red' ? t.status.reason : null,
    reports: { player1: t.reports.player1 ?? null, player2: t.reports.player2 ?? null },
    override: t.override
      ? { override: t.override.override, reason: t.override.reason, by: actorLabel(t.override.by), at: t.override.at.toISOString() }
      : null,
    extraMinutes: t.extraMinutes,
    extraTurns: t.extraTurns,
    deadline: t.deadline?.toISOString() ?? null,
    tomKey: key ? { label: keyLabel(key, t), code: t.keys[key] } : null,
    keyLaunched: t.keyLaunched,
  };
};

/** Painel da organização: a rodada inteira, com Player IDs, reportes, overrides e as keys do TOM. */
export const panel = (
  state: RoundState | null, serverTime: Date, latestRound: number | null, pendingKeys: PanelResponse['pendingKeys'] = [],
): PanelResponse => {
  if (!state?.pairing) return { round: null, latestRound, pendingKeys, serverTime: serverTime.toISOString() };
  const tables = state.tables.map(toPanelTable);
  const counts: Record<TableColor, number> = { gray: 0, orange: 0, green: 0, red: 0 };
  for (const t of tables) counts[t.color]++;
  return {
    round: {
      tournament: state.ref.tournament,
      division: state.ref.division,
      round: state.ref.round,
      bestOf: state.bestOf,
      roundMinutes: state.roundMinutes,
      startedAt: state.startedAt?.toISOString() ?? null,
      tables,
      byes: state.byes,
      counts,
      extension: state.extension,
      allGreen: state.allGreen,
      closed: state.closed,
    },
    latestRound,
    pendingKeys,
    serverTime: serverTime.toISOString(),
  };
};
