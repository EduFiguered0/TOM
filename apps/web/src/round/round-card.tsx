import type { MyRoundResponse } from '@tom/contracts';
import { useEffect, useState } from 'preact/hooks';
import type { Api } from '../api.js';
import { roundClock } from '../tv/board.js';
import { describeReport, reportOptions, seatMessage, type ReportOption } from './round.js';

/** A rodada só muda quando alguém reporta ou o TOM publica: 10 s é suficiente, e a tela também atualiza ao voltar para ela. */
const POLL_MS = 10_000;

/** Mesa, oponente, cronômetro e reporte do jogador. Sucesso só aparece depois do "ok" da API. */
export const RoundCard = ({ api }: { api: Api }) => {
  const [data, setData] = useState<MyRoundResponse | null>(null);
  const [skew, setSkew] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [choice, setChoice] = useState<ReportOption | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accept = (body: MyRoundResponse) => {
    setData(body);
    setSkew(Date.parse(body.serverTime) - Date.now());
  };

  useEffect(() => {
    let stopped = false;
    const load = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const result = await api.myRound();
        if (!stopped && result.ok) accept(result.body);
      } catch { /* sem conexão: mantém a última informação; o reporte avisa se não for enviado */ }
    };
    void load();
    const poll = setInterval(() => { void load(); }, POLL_MS);
    const tick = setInterval(() => { setNow(Date.now()); }, 1000);
    const onVisible = () => { void load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { stopped = true; clearInterval(poll); clearInterval(tick); document.removeEventListener('visibilitychange', onVisible); };
  }, [api]);

  const send = async () => {
    if (!choice) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.report(choice.report);
      if (result.ok) { accept(result.body); setChoice(null); }
      else setError(`Não foi enviado: ${result.error.message}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const round = data?.round;
  if (!round) {
    return <section class="card"><p class="muted">{data ? 'A rodada aparece aqui quando o TOM publicar o pareamento.' : 'Carregando a rodada…'}</p></section>;
  }

  const header = <p class="muted">{round.tournament} · Rodada {round.round} · {round.division}</p>;
  const seat = round.seat;
  if (seat.kind === 'not_checked_in') return <section class="card">{header}<p>Faça o check-in com o ADM para ver a sua mesa e reportar.</p></section>;
  if (seat.kind === 'not_paired') {
    return <section class="card">{header}<p>Você não está em nenhuma mesa nesta rodada (bye ou fora do pareamento). Confira na TV do salão.</p></section>;
  }

  const started = round.startedAt !== null;
  const clock = roundClock({ endsAt: seat.deadline }, now, skew);
  const message = seatMessage(seat, started);
  const canReport = started && !seat.locked && round.bestOf !== null;

  return (
    <section class="card round">
      {header}
      <div class="round-table">
        <span class="round-number">Mesa {seat.table}</span>
        <span class="round-vs">você <span class="muted">x</span> {seat.opponent}</span>
      </div>
      <div class="round-status">
        <span class={`dot ${seat.color}`} aria-hidden="true" />
        <span class={message.tone}>{message.text}</span>
        {clock.state === 'running' && <span class={`round-clock${clock.warning ? ' warn' : ''}`}>{clock.text}</span>}
        {clock.state === 'over' && seat.color !== 'green' && <span class="round-clock error">Tempo esgotado</span>}
      </div>
      {seat.myReport && <p class="muted">Seu reporte: <b>{describeReport(seat.myReport)}</b>{seat.locked ? '' : ' (pode corrigir até a mesa ficar verde)'}</p>}

      {canReport && !choice && round.bestOf && (
        <div class="report-grid">
          {reportOptions(round.bestOf).map((o) => (
            <button key={o.label} type="button" class={`report ${o.tone}`} onClick={() => { setChoice(o); setError(null); }}>{o.label}</button>
          ))}
        </div>
      )}
      {choice && (
        <div class="notice">
          <p>Confirmar o resultado da <b>mesa {seat.table}</b>: <b>{choice.label}</b>?</p>
          <button type="button" disabled={busy} onClick={() => { void send(); }}>{busy ? 'Enviando…' : 'Confirmar e enviar'}</button>
          <button type="button" class="link" disabled={busy} onClick={() => { setChoice(null); }}>Voltar</button>
        </div>
      )}
      {error && <p class="error" role="alert">{error}</p>}
    </section>
  );
};
