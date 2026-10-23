import { describe, expect, it } from 'vitest';
import { latestTournament } from '../src/index.js';

const at = (time: string): Date => new Date(`2026-10-12T${time}:00Z`);

describe('latestTournament', () => {
  it('escolhe o torneio com o arquivo modificado por último e lista só os dele', () => {
    const result = latestTournament([
      { fileName: 'FODASEpairings.html', modifiedAt: at('14:11') },
      { fileName: 'FODASEstandings.html', modifiedAt: at('14:12') },
      { fileName: 'Evento testepairings.html', modifiedAt: at('14:05') },
      { fileName: 'Evento testestandings.html', modifiedAt: at('14:06') },
      { fileName: 'main.css', modifiedAt: at('14:15') },
    ]);

    expect(result).toEqual({
      tournament: 'FODASE',
      lastModifiedAt: at('14:12'),
      files: { pairings: 'FODASEpairings.html', standings: 'FODASEstandings.html' },
    });
  });

  it('um evento antigo volta a ser o atual quando o TOM regrava um arquivo dele', () => {
    const result = latestTournament([
      { fileName: 'FODASEpairings.html', modifiedAt: at('14:11') },
      { fileName: 'Evento testeroster.html', modifiedAt: at('13:50') },
      { fileName: 'Evento testepairings.html', modifiedAt: at('15:00') },
    ]);
    expect(result?.tournament).toBe('Evento teste');
  });

  it('pasta sem relatórios do TOM', () => {
    expect(latestTournament([{ fileName: 'main.css', modifiedAt: at('14:00') }])).toBeNull();
    expect(latestTournament([])).toBeNull();
  });
});
