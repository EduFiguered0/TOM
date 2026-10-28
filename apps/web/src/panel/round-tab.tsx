import { useState } from 'preact/hooks';
import type { Api } from '../api.js';
import { box, field, linkButton, primary } from '../ui.js';
import type { OverrideDto, PanelResponse } from '@tom/contracts';
import { extensionClock, roundClock } from '../tv/board.js';
import { pickTable, reportsToConfirm, resultOverride, winOverride } from './panel.js';
import { ResultsList } from './results-list.js';
import { TableDetail } from './table-detail.js';
import { TablesList } from './tables-list.js';
import type { Panel } from './use-panel.js';

const CHIP = { red: 'border-red text-red', orange: 'border-orange text-orange', gray: 'border-line text-muted', green: 'border-green text-green' } as const;
const LABEL = { red: 'vermelhas', orange: 'laranja', gray: 'cinza', green: 'verdes' } as const;
const note = 'm-0 rounded-md border border-dashed px-3 py-1.5 text-sm';

/** ADM inicia a rodada publicada pelo TOM, em linha no topo da aba. */
const StartRound = ({ api, onStarted }: { api: Api; onStarted: () => void }) => {
  const [bestOf, setBestOf] = useState<1 | 3>(3);
  const [minutes, setMinutes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = (e: Event) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    void api.startRound(bestOf, Number(minutes) || null)
      .then((result) => { if (result.ok) onStarted(); else setError(result.error.message); })
      .catch((err: unknown) => { setError((err as Error).message); })
      .finally(() => { setBusy(false); });
  };

  return (
    <form class="m-0 flex flex-wrap items-center gap-2" onSubmit={start}>
      <select class={`${field} w-auto py-1.5`} aria-label="Formato" value={bestOf} onChange={(e) => { setBestOf(e.currentTarget.value === '1' ? 1 : 3); }}>
        <option value="3">Melhor de 3</option>
        <option value="1">Melhor de 1</option>
      </select>
      <input class={`${field} w-28 py-1.5`} aria-label="Minutos (vazio = o do evento)" placeholder="min (evento)" inputmode="numeric"
        value={minutes} onInput={(e) => { setMinutes(e.currentTarget.value); }} />
      <button type="submit" class={primary} disabled={busy}>{busy ? 'Iniciando…' : 'Iniciar rodada'}</button>
      {error && <span class="text-sm text-error" role="alert">{error}</span>}
    </form>
  );
};

/**
 * Acréscimo da rodada (juiz ou ADM), depois do tempo: minutos (padrão 5) ou turnos extras (padrão 5) para todas as
 * mesas ainda sem resultado. Cada clique vale para as que continuam sem resultado.
 */
const ExtendRound = ({ api, onDone }: { api: Api; onDone: (body: PanelResponse) => void }) => {
  const [mode, setMode] = useState<'minutes' | 'turns'>('minutes');
  const [amount, setAmount] = useState('5');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const extend = (e: Event) => {
    e.preventDefault();
    const n = Number(amount);
    setBusy(true);
    setError(null);
    void api.extend(mode === 'minutes' ? { minutes: n } : { turns: n })
      .then((result) => { if (result.ok) onDone(result.body); else setError(result.error.message); })
      .catch((err: unknown) => { setError((err as Error).message); })
      .finally(() => { setBusy(false); });
  };

  return (
    <form class="m-0 flex flex-wrap items-center gap-2" onSubmit={extend} aria-label="Acréscimo">
      <select class={`${field} w-auto py-1.5`} aria-label="Tipo de acréscimo" value={mode}
        onChange={(e) => { setMode(e.currentTarget.value === 'turns' ? 'turns' : 'minutes'); setAmount('5'); }}>
        <option value="minutes">Minutos</option>
        <option value="turns">Turnos</option>
      </select>
      <input class={`${field} w-16 py-1.5`} aria-label={mode === 'minutes' ? 'Minutos' : 'Turnos'} inputmode="numeric"
        value={amount} onInput={(e) => { setAmount(e.currentTarget.value); }} />
      <button type="submit" class={primary} disabled={busy}>{busy ? 'Lançando…' : 'Acréscimo nas mesas sem resultado'}</button>
      {error && <span class="text-sm text-error" role="alert">{error}</span>}
    </form>
  );
};

/** Aba Rodada: controle da rodada no topo, mesas à esquerda e a mesa escolhida à direita. Sem rolar a página. */
export const RoundTab = ({ api, admin, panel }: { api: Api; admin: boolean; panel: Panel }) => {
  const { data, offline, now, skew, selected: roundSelected, latest, current, open, accept } = panel;
  const [chosen, setChosen] = useState<number | null>(null);
  /** Só o que pede ação: falha ao marcar ou key já lançada no TOM. */
  const [winnerNote, setWinnerNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const round = data?.round;

  if (!data) return <p class="m-0 text-sm text-muted">Carregando…</p>;

  const endsAt = round?.startedAt && round.roundMinutes ? new Date(Date.parse(round.startedAt) + round.roundMinutes * 60_000).toISOString() : null;
  const clock = roundClock({ endsAt }, now, skew);
  const extension = round ? extensionClock(round, now, skew) : { kind: 'none' as const };
  const pending = round ? round.tables.length - round.counts.green : 0;
  const table = round ? pickTable(round.tables, chosen) : null;
  const detail = round?.tables.find((t) => t.table === table);

  const toConfirm = round?.startedAt ? reportsToConfirm(round.tables) : [];

  /** Valida de uma vez as mesas com um reporte só, uma a uma; as que falharem ficam como estavam e são listadas. */
  const confirmReports = async () => {
    if (!round || !toConfirm.length) return;
    const list = toConfirm.map((c) => c.table).join(', ');
    if (!confirm(`Confirmar o reporte de ${String(toConfirm.length)} ${toConfirm.length === 1 ? 'mesa' : 'mesas'} (${list})?`)) return;
    setConfirming(true);
    setWinnerNote(null);
    const failed: number[] = [];
    let tomFix = false;
    for (const { table: n, override } of toConfirm) {
      try {
        const result = await api.override(n, override, current ? undefined : round.round);
        if (!result.ok) { failed.push(n); continue; }
        accept(result.body);
        tomFix ||= result.body.requiresTomFix;
      } catch {
        failed.push(n);
      }
    }
    setConfirming(false);
    if (failed.length) setWinnerNote({ ok: false, text: `Não confirmadas: mesas ${failed.join(', ')}. Tente de novo.` });
    else if (tomFix) setWinnerNote({ ok: false, text: 'Alguma key já tinha sido lançada: corrija também no TOM.' });
  };

  /** Duplo clique no nome: vitória daquele jogador, sem confirmação (duplo clique no outro troca). */
  const markWinner = (n: number, side: 'player1' | 'player2') => { applyOverride(n, winOverride(side)); };

  /** Resultado decidido pelo ADM (duplo clique ou lista de resultados): sem confirmação; outro clique troca. */
  const applyOverride = (n: number, override: OverrideDto) => {
    if (!round) return;
    setChosen(n);
    setWinnerNote(null);
    void api.override(n, override, current ? undefined : round.round)
      .then((result) => {
        if (!result.ok) { setWinnerNote({ ok: false, text: `Vencedor não marcado: ${result.error.message}` }); return; }
        accept(result.body);
        // A caixa verde já mostra o vencedor; só avisa o que pede ação.
        if (result.body.requiresTomFix) setWinnerNote({ ok: false, text: `Mesa ${String(n)}: a key já tinha sido lançada. Corrija também no TOM.` });
      })
      .catch((e: unknown) => { setWinnerNote({ ok: false, text: (e as Error).message }); });
  };

  return (
    <div class="flex min-h-0 flex-1 flex-col gap-3">
      <div class="flex flex-wrap items-center gap-3">
        {latest !== null && latest > 1 && (
          <nav class="flex gap-1" aria-label="Rodadas">
            {Array.from({ length: latest }, (_, i) => i + 1).map((n) => {
              const on = (roundSelected ?? latest) === n;
              return (
                <button key={n} type="button" aria-current={on ? 'page' : undefined} onClick={() => { setChosen(null); open(n); }}
                  class={`rounded-md border px-3 py-1 text-sm ${on ? 'border-accent bg-accent font-bold text-accent-text' : 'border-line bg-panel text-text'}`}>
                  R{n}
                </button>
              );
            })}
          </nav>
        )}
        {round && (
          <>
            <span class="text-base font-bold">Rodada {round.round}{round.bestOf ? ` · melhor de ${String(round.bestOf)}` : ''}</span>
            {(['red', 'orange', 'gray', 'green'] as const).map((c) => (
              <span key={c} class={`rounded-full border px-2 py-0.5 text-xs font-semibold ${CHIP[c]}`}>{round.counts[c]} {LABEL[c]}</span>
            ))}
          </>
        )}
        <div class="flex-1" />
        {offline && <span class="text-sm text-error">Sem conexão · dados podem estar desatualizados</span>}
        {admin && current && round && !round.startedAt && <StartRound api={api} onStarted={() => { open(round.round); }} />}
        {current && round?.startedAt && clock.state === 'over' && pending > 0 && <ExtendRound api={api} onDone={accept} />}
        {round && (
          <span class={`font-extrabold tabular-nums ${clock.state === 'running' ? `text-3xl ${clock.warning ? 'text-warn' : ''}` : clock.state === 'over' ? 'text-lg text-error' : 'text-sm text-muted'}`}>
            {clock.state === 'running' ? clock.text
              : clock.state === 'over'
                ? extension.kind === 'minutes' ? `Acréscimo ${extension.text}` : extension.kind === 'turns' ? `${String(extension.turns)} turnos extras` : 'Tempo esgotado'
                : 'Não iniciada'}
          </span>
        )}
      </div>

      {data.pendingKeys.map((p) => (
        <p key={p.round} class={`${note} border-warn text-warn`}>
          Rodada {p.round}: {p.tables.length === 1 ? 'mesa' : 'mesas'} {p.tables.join(', ')} sem key lançada.{' '}
          {(roundSelected ?? latest) !== p.round && <button type="button" class={linkButton} onClick={() => { setChosen(null); open(p.round); }}>Ver rodada {p.round}</button>}
        </p>
      ))}
      {round?.closed && <p class={`${note} border-green text-ok`}>Todas as keys lançadas: a próxima rodada já pode ser gerada no TOM.</p>}
      {round && !current && !round.startedAt && <p class={`${note} border-line text-muted`}>Rodada não iniciada no site: foi resolvida direto no TOM.</p>}

      {!round && (
        <p class="m-0 text-sm text-muted">
          {roundSelected === null ? 'Nenhuma rodada publicada pelo TOM ainda. Imprima os pareamentos da rodada no TOM.' : `A rodada ${String(roundSelected)} não chegou do TOM para o site.`}
        </p>
      )}
      {winnerNote && <p class={`${note} ${winnerNote.ok ? 'border-green text-ok' : 'border-red text-error'}`} role="status">{winnerNote.text}</p>}
      {round && (
        <div class="grid min-h-0 flex-1 grid-cols-[1fr_380px] gap-4">
          <section class={`${box} p-0`} aria-label="Mesas">
            <TablesList tables={round.tables} started={round.startedAt !== null} selected={table} onSelect={setChosen}
              onWinner={round.startedAt ? markWinner : undefined}
              clockOf={(t) => { const c = roundClock({ endsAt: t.deadline }, now, skew); return c.state === 'running' ? c : null; }} />
            {round.byes.length > 0 && <p class="m-0 border-t border-line px-3 py-2 text-sm text-muted">Bye: {round.byes.join(', ')}</p>}
          </section>
          <section class={box} aria-label="Mesa escolhida">
            {toConfirm.length > 0 && (
              <button type="button" class={primary} disabled={confirming} onClick={() => { void confirmReports(); }}>
                {confirming ? 'Confirmando…' : `Confirmar reportes (${String(toConfirm.length)})`}
              </button>
            )}
            {detail
              ? <TableDetail api={api} table={detail} admin={admin} started={round.startedAt !== null} round={current ? undefined : round.round}
                  bestOf={round.bestOf} onUpdate={accept} />
              : <p class="m-0 text-sm text-muted">Rodada sem mesas.</p>}
            {round.startedAt && <ResultsList tables={round.tables} busy={confirming}
              onResult={(n, side, outcome) => { applyOverride(n, resultOverride(side, outcome)); }} />}
          </section>
        </div>
      )}
    </div>
  );
};
