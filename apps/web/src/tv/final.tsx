import type { FinalStandingDto } from '@tom/contracts';
import { Trophy } from 'lucide-preact';
import { useEffect, useState } from 'preact/hooks';
import { pages } from './board.js';
import { eventTitle, screen } from './styles.js';

/** Linhas por página: cabem em 1080p e em 720p sem rolar; a TV troca de página sozinha. */
const PER_PAGE = 12;
const PAGE_MS = 15_000;

const pct = (value: number | null) => (value === null ? '—' : `${value.toFixed(2)}%`);
const cell = 'px-[1vw] py-[.8vh]';

/** Desempates só vêm na classificação do TOM; o registro de partida não os tem. */
export const hasTiebreakers = (standings: FinalStandingDto[]): boolean => standings.some((s) => s.opponentWinPct !== null);

/** Classificação com pontos e desempates do TOM, em páginas que viram sozinhas. O primeiro em destaque. */
export const StandingsTable = ({ standings }: { standings: FinalStandingDto[] }) => {
  const [page, setPage] = useState(0);
  const all = pages(standings, PER_PAGE);
  const current = all[page % all.length] ?? [];
  const tiebreakers = hasTiebreakers(standings);

  useEffect(() => {
    const flip = setInterval(() => { setPage((p) => p + 1); }, PAGE_MS);
    return () => { clearInterval(flip); };
  }, []);

  return (
    <div class="flex min-h-0 flex-col gap-[1vh]">
      <table class="w-full border-collapse text-[1.7vw] tabular-nums">
        <thead>
          <tr class="border-b border-line text-left text-[1.1vw] uppercase tracking-wide text-muted">
            <th class={`${cell} w-[6vw] text-right font-semibold`}>#</th>
            <th class={`${cell} font-semibold`}>Jogador</th>
            <th class={`${cell} text-center font-semibold`}>V-D-E</th>
            <th class={`${cell} text-center font-semibold`}>Pontos</th>
            {tiebreakers && <th class={`${cell} text-right font-semibold`}>% vit. oponentes</th>}
            {tiebreakers && <th class={`${cell} text-right font-semibold`}>% vit. op. dos op.</th>}
          </tr>
        </thead>
        <tbody>
          {current.map((s) => (
            <tr key={`${s.division}-${String(s.rank)}`} class={`border-b border-line ${s.rank === 1 ? 'bg-orange/10 font-bold text-orange' : ''}`}>
              <td class={`${cell} text-right font-extrabold`}>{s.rank}</td>
              <td class={cell}>
                <span class="flex items-center gap-[.8vw]">
                  {s.rank === 1 && <Trophy size="1.6vw" aria-label="Primeiro" />}{s.name}
                </span>
              </td>
              <td class={`${cell} text-center`}>{s.wins}-{s.losses}-{s.ties}</td>
              <td class={`${cell} text-center`}>{s.points ?? '—'}</td>
              {tiebreakers && <td class={`${cell} text-right ${s.rank === 1 ? '' : 'text-muted'}`}>{pct(s.opponentWinPct)}</td>}
              {tiebreakers && <td class={`${cell} text-right ${s.rank === 1 ? '' : 'text-muted'}`}>{pct(s.opponentsOpponentWinPct)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      {all.length > 1 && <div class="text-right text-[1.2vw] text-muted">Página {(page % all.length) + 1} de {all.length}</div>}
    </div>
  );
};

/** Classificação final em tela cheia, até o próximo evento. */
export const FinalTv = ({ label, standings }: { label: string; standings: FinalStandingDto[] }) => (
  <div class={screen}>
    <header class={eventTitle}>{label} · Classificação final</header>
    <StandingsTable standings={standings} />
  </div>
);
