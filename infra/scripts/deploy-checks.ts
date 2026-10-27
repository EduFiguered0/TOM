export interface RepoState {
  branch: string;
  /** Alterações locais não commitadas. */
  dirty: boolean;
  /** Commits do GitHub que faltam na main local, e o contrário. */
  behind: number;
  ahead: number;
  /** Commits depois da última tag de release. */
  unreleased: number;
}

/** O deploy só sobe o que está na main do GitHub; o que ainda não virou release só gera aviso. */
export const preflight = (s: RepoState): { errors: string[]; warnings: string[] } => {
  const errors: string[] = [];
  if (s.branch !== 'main') errors.push(`Você está no branch "${s.branch}": rode git switch main.`);
  if (s.dirty) errors.push('Há alterações locais não commitadas: o deploy sairia diferente do GitHub.');
  if (s.behind > 0) errors.push(`A main local está ${String(s.behind)} commit(s) atrás do GitHub: rode git pull.`);
  if (s.ahead > 0) errors.push(`A main local tem ${String(s.ahead)} commit(s) que não estão no GitHub.`);
  const warnings = s.unreleased > 0
    ? [`${String(s.unreleased)} commit(s) depois da última release: o que vai ao ar ainda não tem versão (Actions → Release → Run workflow).`]
    : [];
  return { errors, warnings };
};
