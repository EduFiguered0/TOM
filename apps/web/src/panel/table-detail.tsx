import type { OverrideDto, PanelResponse, PanelTable } from '@tom/contracts';
import { useEffect, useState } from 'preact/hooks';
import type { Api, ApiResult } from '../api.js';
import { field, ghost, linkButton, primary } from '../ui.js';
import { reportOptions, type ReportOption } from '../round/round.js';
import { describeOverride, describePlayerReport, nextAction, overrideScores } from './panel.js';

interface Props {
  api: Api;
  table: PanelTable;
  admin: boolean;
  started: boolean;
  /** Rodada anterior aberta nas abas; sem ela, a atual. */
  round: number | undefined;
  bestOf: 1 | 3 | null;
  onUpdate: (panel: PanelResponse) => void;
}


const sameOverride = (a: OverrideDto, b: OverrideDto): boolean => JSON.stringify(a) === JSON.stringify(b);

/** Botões do ajuste, agrupados por quem venceu: o placar sempre do ponto de vista de quem venceu. */
const overrideGroups = (t: PanelTable, bestOf: 1 | 3): { title: string; options: { label: string; value: OverrideDto }[] }[] => {
  const scores = overrideScores(bestOf);
  const score = (a: number, b: number): OverrideDto => ({ kind: 'score', player1: a, player2: b });
  return [
    { title: `${t.player1.name} venceu`, options: scores.filter(([a, b]) => a > b).map(([a, b]) => ({ label: `${String(a)}x${String(b)}`, value: score(a, b) })) },
    { title: `${t.player2.name} venceu`, options: scores.filter(([a, b]) => a < b).map(([a, b]) => ({ label: `${String(b)}x${String(a)}`, value: score(a, b) })) },
    {
      title: 'Empate',
      options: [
        ...scores.filter(([a, b]) => a === b).map(([a, b]) => ({ label: `${String(a)}x${String(b)}`, value: score(a, b) })),
        { label: 'ID', value: { kind: 'intentional_draw' } },
      ],
    },
    {
      title: 'Outros',
      options: [
        { label: `${t.player1.name} ausente`, value: { kind: 'win_by_absence', winner: 'player2' } },
        { label: `${t.player2.name} ausente`, value: { kind: 'win_by_absence', winner: 'player1' } },
        { label: 'DGL', value: { kind: 'double_game_loss' } },
      ],
    },
  ];
};

const section = 'flex flex-col gap-2 border-t border-line pt-3';
const small = `${field} py-1.5`;

/** Mesa escolhida: reportes, override vigente e as ações (override, key lançada, acréscimo, reporte por jogador). */
export const TableDetail = ({ api, table: t, admin, started, round, bestOf, onUpdate }: Props) => {
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [choice, setChoice] = useState<OverrideDto | null>(null);
  const [minutes, setMinutes] = useState('5');
  const [side, setSide] = useState<'player1' | 'player2'>('player1');
  const [pending, setPending] = useState<ReportOption | null>(null);

  // Outra mesa: o formulário começa limpo.
  useEffect(() => { setMessage(null); setPending(null); setChoice(null); }, [t.table, round]);

  const run = async (action: () => Promise<ApiResult<PanelResponse & { requiresTomFix?: boolean }>>, done: string) => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await action();
      if (!result.ok) { setMessage({ ok: false, text: `Não foi feito: ${result.error.message}` }); return; }
      onUpdate(result.body);
      setMessage({ ok: true, text: result.body.requiresTomFix ? `${done} A key já tinha sido lançada: corrija também no TOM.` : done });
      setPending(null);
      setChoice(null);
    } catch (e) {
      setMessage({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const name = (s: 'player1' | 'player2') => t[s].name;
  const row = (label: string, value: string) => (
    <div class="flex justify-between gap-3 text-sm"><span class="text-muted">{label}</span><span class="text-right">{value}</span></div>
  );

  return (
    <div class="flex min-h-0 flex-col gap-3 overflow-y-auto">
      <div>
        <div class="text-xs text-muted">Mesa {t.table}</div>
        <div class="font-bold">{t.player1.name} <span class="font-normal text-muted">x</span> {t.player2.name}</div>
        <div class="text-sm text-muted">{nextAction(t, started)}</div>
      </div>

      <div class="flex flex-col gap-1">
        {row(`${t.player1.name} (${t.player1.playerId})`, describePlayerReport(t.reports.player1))}
        {row(`${t.player2.name} (${t.player2.playerId})`, describePlayerReport(t.reports.player2))}
        {t.override && row('Override', `${describeOverride(t.override.override, t)}${t.override.reason ? ` · “${t.override.reason}”` : ''}`)}
        {t.extraMinutes > 0 && row('Acréscimo', `${String(t.extraMinutes)} min`)}
      </div>

      {t.tomKey && (
        <div class="flex items-center justify-between gap-2 rounded-md border border-dashed border-green px-3 py-2">
          <span class="text-sm">{t.tomKey.label}</span>
          <span class="font-mono text-xl font-extrabold">{t.tomKey.code}</span>
        </div>
      )}
      {admin && t.color === 'green' && !t.keyLaunched && (
        <button type="button" class={primary} disabled={busy} onClick={() => { void run(() => api.keyLaunched(t.table, round), 'Key marcada como lançada.'); }}>
          Key lançada no TOM
        </button>
      )}

      {started && (
        <form class={`m-0 ${section}`} onSubmit={(e) => {
          e.preventDefault();
          if (choice) void run(() => api.override(t.table, choice, round), 'Resultado ajustado.');
        }}>
          <h3 class="m-0 text-sm font-bold">Ajustar resultado</h3>
          {overrideGroups(t, bestOf ?? 3).map((g) => (
            <div key={g.title} class="flex flex-col gap-1">
              <span class="text-xs text-muted">{g.title}</span>
              <div class="flex flex-wrap gap-1.5">
                {g.options.map((o) => {
                  const on = choice !== null && sameOverride(choice, o.value);
                  return (
                    <button key={o.label} type="button" aria-pressed={on} onClick={() => { setChoice(o.value); }}
                      class={`rounded-md border px-3 py-1.5 text-sm font-semibold ${on ? 'border-accent bg-accent text-accent-text' : 'border-line bg-bg text-text hover:border-accent'}`}>
                      {o.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <button type="submit" class={primary} disabled={busy || !choice}>
            {choice ? `Aplicar: ${describeOverride(choice, t)}` : 'Escolha o resultado'}
          </button>
        </form>
      )}

      {started && !t.keyLaunched && (
        <form class={`m-0 ${section}`} onSubmit={(e) => { e.preventDefault(); void run(() => api.extend(t.table, Number(minutes), round), 'Acréscimo lançado.'); }}>
          <h3 class="m-0 text-sm font-bold">Acréscimo de tempo</h3>
          <div class="flex items-center gap-2">
            <input class={`${small} w-20`} aria-label="Minutos" inputmode="numeric" value={minutes} onInput={(e) => { setMinutes(e.currentTarget.value); }} />
            <button type="submit" class={`${ghost} whitespace-nowrap`} disabled={busy}>Somar minutos</button>
          </div>
        </form>
      )}

      {admin && started && bestOf && t.color !== 'green' && !t.keyLaunched && (
        <div class={section}>
          <h3 class="m-0 text-sm font-bold">Reportar por jogador sem celular</h3>
          <select class={small} aria-label="Jogador" value={side} onChange={(e) => { setSide(e.currentTarget.value as 'player1' | 'player2'); setPending(null); }}>
            <option value="player1">Por {name('player1')}</option>
            <option value="player2">Por {name('player2')}</option>
          </select>
          {!pending ? (
            <div class="grid grid-cols-3 gap-1.5">
              {reportOptions(bestOf).map((o) => (
                <button key={o.label} type="button" class={`${ghost} px-2 py-1.5 text-xs`} onClick={() => { setPending(o); }}>{o.label}</button>
              ))}
            </div>
          ) : (
            <div class="flex flex-wrap items-center gap-2 rounded-md border border-dashed border-warn p-2 text-sm">
              <span>Por <b>{name(side)}</b>: <b>{pending.label}</b>?</span>
              <button type="button" class={primary} disabled={busy} onClick={() => { void run(() => api.staffReport(t.table, side, pending.report, round), 'Reporte registrado.'); }}>Confirmar</button>
              <button type="button" class={linkButton} onClick={() => { setPending(null); }}>Voltar</button>
            </div>
          )}
        </div>
      )}

      {message && <p class={`m-0 text-sm ${message.ok ? 'text-ok' : 'text-error'}`} role={message.ok ? 'status' : 'alert'}>{message.text}</p>}
    </div>
  );
};
