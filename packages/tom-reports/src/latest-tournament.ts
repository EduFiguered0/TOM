import { identifyReportFile, type ReportType } from './report-file.js';

export interface ReportFileInfo {
  fileName: string;
  modifiedAt: Date;
}

export interface TournamentFiles {
  tournament: string;
  lastModifiedAt: Date;
  files: Partial<Record<ReportType, string>>;
}

/** A pasta do TOM guarda vários torneios; o atual é o que teve arquivo regravado por último. */
export const latestTournament = (files: readonly ReportFileInfo[]): TournamentFiles | null => {
  const byTournament = new Map<string, TournamentFiles>();
  for (const { fileName, modifiedAt } of files) {
    const id = identifyReportFile(fileName);
    if (!id) continue;
    const entry = byTournament.get(id.tournament) ?? { tournament: id.tournament, lastModifiedAt: modifiedAt, files: {} };
    entry.files[id.type] = fileName;
    if (modifiedAt > entry.lastModifiedAt) entry.lastModifiedAt = modifiedAt;
    byTournament.set(id.tournament, entry);
  }
  let latest: TournamentFiles | null = null;
  for (const entry of byTournament.values()) {
    if (!latest || entry.lastModifiedAt > latest.lastModifiedAt) latest = entry;
  }
  return latest;
};
