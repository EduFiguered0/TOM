import type { OverrideDto, PanelResponse, PanelTable } from '@tom/contracts';
import { useState } from 'preact/hooks';
import type { Api, ApiResult } from '../api.js';
import { reportOptions, type ReportOption } from '../round/round.js';
import { roundClock } from '../tv/board.js';
import { describeOverride, describePlayerReport, nextAction } from './panel.js';

interface Props {
  api: Api;
  table: PanelTable;
  admin: boolean;
  started: boolean;
  /** Rodada anterior aberta nas abas; sem ela, a atual. */
  round: number | undefined;
  bestOf: 1 | 3 | null;
  now: number;
  skew: number;
  onUpdate: (panel: PanelResponse) => void;
}

type OverrideKind = OverrideDto['kind'];

/** Uma mesa no painel: resumo sempre visível; reportes e ações ao abrir. */
export const TableRow = ({ api, table: t, admin, started, round, bestOf, now, skew, onUpdate }: Props) => {
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

  const clock = roundClock({ endsAt: t.deadline }, now, skew);
  const name = (s: 'player1' | 'player2') => t[s].name;

  return (
    <details class={`panel-table ${t.color}${t.keyLaunched ? ' launched' : ''}`}>
      <summary>
        <span class="pt-number">{t.table}</span>
        <span class="pt-players">{t.player1.name} <span class="muted">x</span> {t.player2.name}</span>
        <span class="pt-action">{nextAction(t, started)}</span>
        {t.tomKey && !t.keyLaunched && <span class="pt-key" title={t.tomKey.label}>{t.tomKey.code}</span>}
        {clock.state === 'running' && t.color !== 'green' && <span class={`pt-clock${clock.warning ? ' warn' : ''}`}>{clock.text}</span>}
      </summary>

      <div class="pt-body">
        <dl>
          <dt>{t.player1.name} ({t.player1.playerId})</dt><dd>{describePlayerReport(t.reports.player1)}</dd>
          <dt>{t.player2.name} ({t.player2.playerId})</dt><dd>{describePlayerReport(t.reports.player2)}</dd>
          {t.override && (<><dt>Override</dt><dd>{describeOverride(t.override.override, t)} · “{t.override.reason}” · {t.override.by}</dd></>)}
          {t.extraMinutes > 0 && (<><dt>Acréscimo</dt><dd>{t.extraMinutes} min</dd></>)}
          {t.tomKey && (<><dt>Key do TOM</dt><dd><b>{t.tomKey.code}</b> · {t.tomKey.label}</dd></>)}
        </dl>

        {admin && t.color === 'green' && !t.keyLaunched && (
          <button type="button" disabled={busy} onClick={() => { void run(() => api.keyLaunched(t.table, round), 'Key marcada como lançada.'); }}>
            Key lançada no TOM
          </button>
        )}

        {started && (
          <form class="pt-form" onSubmit={(e) => { e.preventDefault(); void run(() => api.override(t.table, override(), reason, round), 'Override aplicado.'); }}>
            <h3>Override</h3>
            <select value={kind} onChange={(e) => { setKind(e.currentTarget.value as OverrideKind); }}>
              <option value="score">Placar</option>
              <option value="intentional_draw">Intentional draw (ID)</option>
              <option value="double_game_loss">Double game loss (DGL)</option>
              <option value="win_by_absence">Vitória por ausência</option>
            </select>
            {kind === 'score' && (
              <div class="pt-inline">
                <input aria-label={`Games de ${name('player1')}`} inputmode="numeric" placeholder={name('player1')} value={p1} onInput={(e) => { setP1(e.currentTarget.value); }} />
                <span>x</span>
                <input aria-label={`Games de ${name('player2')}`} inputmode="numeric" placeholder={name('player2')} value={p2} onInput={(e) => { setP2(e.currentTarget.value); }} />
              </div>
            )}
            {kind === 'win_by_absence' && (
              <select value={winner} onChange={(e) => { setWinner(e.currentTarget.value as 'player1' | 'player2'); }}>
                <option value="player1">Vence {name('player1')}</option>
                <option value="player2">Vence {name('player2')}</option>
              </select>
            )}
            <input placeholder="Motivo (obrigatório)" required value={reason} onInput={(e) => { setReason(e.currentTarget.value); }} />
            <button type="submit" disabled={busy}>Aplicar override</button>
          </form>
        )}

        {started && !t.keyLaunched && (
          <form class="pt-form" onSubmit={(e) => { e.preventDefault(); void run(() => api.extend(t.table, Number(minutes), round), 'Acréscimo lançado.'); }}>
            <h3>Acréscimo de tempo</h3>
            <div class="pt-inline">
              <input aria-label="Minutos" inputmode="numeric" value={minutes} onInput={(e) => { setMinutes(e.currentTarget.value); }} />
              <button type="submit" disabled={busy}>Somar minutos</button>
            </div>
          </form>
        )}

        {admin && started && bestOf && t.color !== 'green' && !t.keyLaunched && (
          <div class="pt-form">
            <h3>Reportar por jogador sem celular</h3>
            <select value={side} onChange={(e) => { setSide(e.currentTarget.value as 'player1' | 'player2'); setPending(null); }}>
              <option value="player1">Por {name('player1')}</option>
              <option value="player2">Por {name('player2')}</option>
            </select>
            {!pending ? (
              <div class="report-grid">
                {reportOptions(bestOf).map((o) => <button key={o.label} type="button" class={`report ${o.tone}`} onClick={() => { setPending(o); }}>{o.label}</button>)}
              </div>
            ) : (
              <div class="notice">
                <p>Reportar por <b>{name(side)}</b>: <b>{pending.label}</b>?</p>
                <button type="button" disabled={busy} onClick={() => { void run(() => api.staffReport(t.table, side, pending.report, round), 'Reporte registrado.'); }}>Confirmar</button>
                <button type="button" class="link" onClick={() => { setPending(null); }}>Voltar</button>
              </div>
            )}
          </div>
        )}

        {message && <p class={message.ok ? 'ok' : 'error'} role={message.ok ? 'status' : 'alert'}>{message.text}</p>}
      </div>
    </details>
  );
};
