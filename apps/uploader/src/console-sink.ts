import {
  parseMatchRecord,
  parseMatchSlips,
  parsePairings,
  parseRoster,
  parseStandings,
  parseTournamentDetails,
  type ReportType,
} from '@tom/tom-reports';
import type { Sink, Snapshot } from './sink.js';

const summaries: Partial<Record<ReportType, (html: string) => string>> = {
  match_slips: (h) => `${String(parseMatchSlips(h).slips.length)} guias`,
  pairings: (h) => {
    const r = parsePairings(h);
    return `rodada ${String(r.round)}, ${String(r.pairings.filter((p) => p.table !== null).length)} mesas`;
  },
  standings: (h) => {
    const r = parseStandings(h);
    return `rodada ${String(r.round)}, ${String(r.standings.length)} jogadores`;
  },
  matchrecord: (h) => `rodada ${String(parseMatchRecord(h).round)}`,
  roster: (h) => `${String(parseRoster(h).players.length)} jogadores`,
  tournament_details: (h) => parseTournamentDetails(h).location,
};

const summarize = (s: Snapshot): string => {
  const fn = summaries[s.type];
  if (!fn) return 'sem parser';
  try {
    return fn(s.content);
  } catch (e) {
    return `⚠ formato não reconhecido: ${e instanceof Error ? e.message : String(e)}`;
  }
};

/** Destino provisório (fases 4–9): só registra o que seria enviado; nada sai da máquina. */
export class ConsoleSink implements Sink {
  constructor(private readonly write: (line: string) => void = console.log) {}

  send(s: Snapshot): Promise<void> {
    this.write(`detectado ${s.type.padEnd(18)} ${s.fileName}  sha ${s.sha256.slice(0, 10)}  · ${summarize(s)}`);
    return Promise.resolve();
  }
}
