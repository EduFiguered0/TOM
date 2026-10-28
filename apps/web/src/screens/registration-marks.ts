import type { RegistrationDto } from '@tom/contracts';

/** Verde = lançado no TOM (gravado no servidor); laranja = Player ID copiado, lançamento em andamento (só neste navegador). */
export const rowTone = (r: Pick<RegistrationDto, 'accountId' | 'launched' | 'removed'>, copied: ReadonlySet<string>): 'green' | 'orange' | null =>
  r.removed ? null : r.launched ? 'green' : copied.has(r.accountId) ? 'orange' : null;

const key = (eventId: string) => `tom:copiados:${eventId}`;

/** Lembrete de trabalho do ADM: some com o navegador sem prejuízo (o verde fica no servidor). */
export const loadCopied = (eventId: string): Set<string> => {
  try {
    const raw = localStorage.getItem(key(eventId));
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
};

export const saveCopied = (eventId: string, copied: ReadonlySet<string>): void => {
  try {
    localStorage.setItem(key(eventId), JSON.stringify([...copied]));
  } catch {
    // Navegador sem armazenamento: a marca vale só até recarregar.
  }
};
