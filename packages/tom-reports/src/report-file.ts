export const REPORT_TYPES = [
  'match_slips',
  'pairings',
  'standings',
  'matchrecord',
  'roster',
  'tournament_details',
  'brackets',
] as const;

export type ReportType = (typeof REPORT_TYPES)[number];

/** O TOM nomeia os arquivos como `<torneio><tipo>.html`, ex.: `FODASEpairings.html`. */
export const identifyReportFile = (
  fileName: string,
): { tournament: string; type: ReportType } | null => {
  const base = fileName.replace(/\.html$/i, '');
  if (base === fileName) return null;
  const type = REPORT_TYPES.find((t) => base.endsWith(t));
  const tournament = type ? base.slice(0, -type.length) : '';
  return type && tournament ? { tournament, type } : null;
};
