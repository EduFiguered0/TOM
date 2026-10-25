import type { OverrideDto, PanelResponse, PanelTable } from '@tom/contracts';
import { useEffect, useState } from 'preact/hooks';
import type { Api, ApiResult } from '../api.js';
import { field, ghost, linkButton, primary } from '../admin/ui.js';
import { reportOptions, type ReportOption } from '../round/round.js';
import { describeOverride, describePlayerReport, nextAction } from './panel.js';

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

type OverrideKind = OverrideDto['kind'];

const section = 'flex flex-col gap-2 border-t border-line pt-3';
const small = `${field} py-1.5`;

/** Mesa escolhida: reportes, override vigente e as ações (override, key lançada, acréscimo, reporte por jogador). */
export const TableDetail = ({ api, table: t, admin, started, round, bestOf, onUpdate }: Props) => {
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<OverrideKind>('score');
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [winner, setWinner] = useState<'player1' | 'player2'>('player1');
  const [reason, setReason] = useState('');
  const [minutes, setMinutes] = useState('5');
  const [side, setSide] = useState<'player1' | 'player2'>('player1');
  const [pending, setPending] = useState<ReportOption | null>(null);

  // Outra mesa: o formulário começa limpo.
  useEffect(() => { setMessage(null); setPending(null); setP1(''); setP2(''); setReason(''); }, [t.table, round]);

  const run = async (action: () => Promise<ApiResult<PanelResponse & { requiresTomFix?: boolean }>>, done: string) => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await action();
      if (!result.ok) { setMessage({ ok: false, text: `Não foi feito: ${result.error.message}` }); return; }
      onUpdate(result.body);
      setMessage({ ok: true, text: result.body.requiresTomFix ? `${done} A key já tinha sido lançada: corrija também no TOM.` : done });
      setPending(null);
    } catch (e) {
      setMessage({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const override = (): OverrideDto => {
    switch (kind) {
      case 'score': return { kind, player1: Number(p1), player2: Number(p2) };
      case 'win_by_absence': return { kind, winner };
      default: return { kind };
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
        {t.override && row('Override', `${describeOverride(t.override.override, t)} · “${t.override.reason}”`)}
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
        <form class={`m-0 ${section}`} onSubmit={(e) => { e.preventDefault(); void run(() => api.override(t.table, override(), reason, round), 'Override aplicado.'); }}>
          <h3 class="m-0 text-sm font-bold">Ajustar resultado</h3>
          <select class={small} aria-label="Tipo de ajuste" value={kind} onChange={(e) => { setKind(e.currentTarget.value as OverrideKind); }}>
            <option value="score">Placar</option>
            <option value="intentional_draw">Intentional draw (ID)</option>
            <option value="double_game_loss">Double game loss (DGL)</option>
            <option value="win_by_absence">Vitória por ausência</option>
          </select>
          {kind === 'score' && (
            <div class="flex items-center gap-2">
              <input class={small} aria-label={`Games de ${name('player1')}`} inputmode="numeric" placeholder={name('player1')} value={p1} onInput={(e) => { setP1(e.currentTarget.value); }} />
              <span class="text-muted">x</span>
              <input class={small} aria-label={`Games de ${name('player2')}`} inputmode="numeric" placeholder={name('player2')} value={p2} onInput={(e) => { setP2(e.currentTarget.value); }} />
            </div>
          )}
          {kind === 'win_by_absence' && (
            <select class={small} aria-label="Vencedor" value={winner} onChange={(e) => { setWinner(e.currentTarget.value as 'player1' | 'player2'); }}>
              <option value="player1">Vence {name('player1')}</option>
              <option value="player2">Vence {name('player2')}</option>
            </select>
          )}
          <input class={small} aria-label="Motivo" placeholder="Motivo (obrigatório)" required value={reason} onInput={(e) => { setReason(e.currentTarget.value); }} />
          <button type="submit" class={`${ghost} self-start`} disabled={busy}>Aplicar</button>
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
