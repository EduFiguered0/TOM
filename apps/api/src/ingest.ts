import type { UploadRequest, UploadResponse } from '@tom/contracts';
import {
  CommandRejected,
  SnapshotIntegrityError,
  type Actor,
  type EventRegistry,
  type EventService,
  type RoundPairing,
  type RoundService,
  type SnapshotStore,
} from '@tom/core';
import {
  identifyReportFile,
  InconsistentReportsError,
  parseMatchSlips,
  parsePairings,
  parseStandings,
  toRoundPairings,
  TomParseError,
} from '@tom/tom-reports';

export interface IngestDeps {
  events: EventService;
  registry: EventRegistry;
  snapshots: SnapshotStore;
  rounds: RoundService;
  clock: { now(): Date };
}

const UPLOADER: Actor = { role: 'system', source: 'uploader' };
/** Só estes dois montam a rodada: pareamento (mesas, divisão, bye) e guias (Player ID e keys). */
const ROUND_REPORTS = ['pairings', 'match_slips'] as const;

const nothing = (stored: boolean, note: string | null): UploadResponse => ({ stored, published: [], note });

/** JSON com as chaves ordenadas: o DynamoDB devolve os mapas em outra ordem, então JSON.stringify direto nunca bate. */
const canonical = (value: unknown): string => JSON.stringify(value, (_, v: unknown) =>
  v && typeof v === 'object' && !Array.isArray(v)
    ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
    : v);

/**
 * Recebe um HTML do enviador: confere token e integridade, guarda a fotografia e, se for pareamento ou guias,
 * tenta montar a rodada com a versão mais recente do outro arquivo. Reenvio igual não republica nada.
 */
export const createIngest = ({ events, registry, snapshots, rounds, clock }: IngestDeps) => {
  const latest = async (tournament: string, report: string) => {
    const versions = await snapshots.versions(tournament, report);
    const last = versions.at(-1);
    return last ? snapshots.load(last) : null;
  };

  const publish = async (eventId: string, pairing: RoundPairing): Promise<boolean> => {
    const state = await rounds.state(pairing.ref);
    if (canonical(state.pairing) === canonical(pairing)) return false;
    try {
      await rounds.publishPairing(UPLOADER, pairing);
    } catch (e) {
      // Rodada já começou: o pareamento não muda mais (spec); o TOM pode ter só regravado o arquivo.
      if (e instanceof CommandRejected && e.code === 'round_already_started') return false;
      throw e;
    }
    await registry.setCurrent({ eventId, ref: pairing.ref, updatedAt: clock.now() });
    return true;
  };

  /** Standings da última rodada prevista: o TOM terminou o torneio e o ADM pode encerrar o evento. */
  const finalResult = async (eventId: string, content: string): Promise<UploadResponse> => {
    let report;
    try {
      report = parseStandings(content);
    } catch (e) {
      if (e instanceof TomParseError) return nothing(true, e.message);
      throw e;
    }
    if (report.totalRounds === null || report.round < report.totalRounds) return nothing(true, null);
    const event = await events.markFinal(eventId, report.standings.map((s) => ({
      division: s.division, rank: s.rank, name: s.name, wins: s.record.wins, losses: s.record.losses, ties: s.record.ties,
    })));
    // Antes de o evento começar (ex.: torneio de teste no TOM), os standings só ficam guardados.
    return nothing(true, event.status === 'final' ? 'Resultado final recebido' : null);
  };

  return async (token: string, upload: UploadRequest): Promise<UploadResponse> => {
    const id = identifyReportFile(upload.fileName);
    if (id?.tournament !== upload.tournament || id.type !== upload.report) {
      throw new CommandRejected('invalid_input', `Arquivo "${upload.fileName}" não corresponde a ${upload.tournament}/${upload.report}`);
    }
    const event = await events.authorizeUpload(token, upload.tournament);

    let stored: boolean;
    try {
      stored = await snapshots.save({
        tournament: upload.tournament,
        report: upload.report,
        capturedAt: new Date(upload.modifiedAt),
        sha256: upload.sha256,
        content: upload.content,
      });
    } catch (e) {
      if (e instanceof SnapshotIntegrityError) throw new CommandRejected('invalid_input', e.message);
      throw e;
    }
    if (!stored) return nothing(false, 'Versão já recebida');
    if (upload.report === 'standings') return finalResult(event.id, upload.content);
    if (!(ROUND_REPORTS as readonly string[]).includes(upload.report)) return nothing(true, null);

    const [slips, pairings] = await Promise.all([latest(upload.tournament, 'match_slips'), latest(upload.tournament, 'pairings')]);
    if (!slips || !pairings) return nothing(true, 'Aguardando o outro arquivo da rodada (pareamento ou guias)');

    let built: RoundPairing[];
    try {
      built = toRoundPairings(parseMatchSlips(slips.content), parsePairings(pairings.content));
    } catch (e) {
      // Guias e pareamento de rodadas diferentes (o TOM grava um de cada vez): espera o próximo envio.
      if (e instanceof InconsistentReportsError || e instanceof TomParseError) return nothing(true, e.message);
      throw e;
    }
    const published: UploadResponse['published'] = [];
    for (const pairing of built) {
      if (await publish(event.id, pairing)) published.push({ division: pairing.ref.division, round: pairing.ref.round });
    }
    return { stored: true, published, note: published.length ? null : 'Rodada sem mudanças' };
  };
};

export type Ingest = ReturnType<typeof createIngest>;
