import type { MyRoundResponse } from '@tom/contracts';
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { Api } from '../api.js';
import { bigPrimary, card, Feedback, muted, textButton, TONE } from '../ui.js';
import { Avatar } from '../photo/avatar.js';
import { createPhotoCache } from '../photo/photo-cache.js';
import { roundClock } from '../tv/board.js';
import { describeReport, reportOptions, seatMessage, type ReportOption } from './round.js';

/** A rodada só muda quando alguém reporta ou o TOM publica: 10 s é suficiente, e a tela também atualiza ao voltar para ela. */
const POLL_MS = 10_000;

const DOT = { gray: 'bg-gray', orange: 'bg-orange', green: 'bg-green', red: 'bg-red' } as const;
const BORDER = { gray: 'border-l-gray', orange: 'border-l-orange', green: 'border-l-green', red: 'border-l-red' } as const;
const REPORT = { win: 'bg-accent text-accent-text', loss: 'bg-slate-600 text-white', draw: 'border border-line bg-panel text-text' } as const;

/** Mesa, oponente, cronômetro e reporte do jogador. Sucesso só aparece depois do "ok" da API. */
export const RoundCard = ({ api, me }: { api: Api; me: { photo: string | null; name: string } }) => {
  const [data, setData] = useState<MyRoundResponse | null>(null);
  const photos = useMemo(() => createPhotoCache(async (id) => { const r = await api.photo(id); return r.ok ? r.body.photo : null; }), [api]);
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
    return <section class={card}><p class={muted}>{data ? 'A rodada aparece aqui quando o TOM publicar o pareamento.' : 'Carregando a rodada…'}</p></section>;
  }

  const header = <p class={muted}>{round.tournament} · Rodada {round.round} · {round.division}</p>;
  const seat = round.seat;
  if (seat.kind === 'not_checked_in') return <section class={card}>{header}<p class="m-0">Informe seu Player ID para ver a sua mesa e reportar.</p></section>;
  if (seat.kind === 'not_paired') {
    return <section class={card}>{header}<p class="m-0">Você não está em nenhuma mesa nesta rodada (bye ou fora do pareamento). Confira na TV do salão.</p></section>;
  }

  const started = round.startedAt !== null;
  const clock = roundClock({ endsAt: seat.deadline }, now, skew);
  const message = seatMessage(seat, started);
  const canReport = started && !seat.locked && round.bestOf !== null;

  return (
    <section class={`${card} border-l-8 ${BORDER[seat.color]}`}>
      {header}
      <div class="flex items-baseline justify-between gap-3">
        <span class="text-3xl font-extrabold">Mesa {seat.table}</span>
        {clock.state === 'running' && <span class={`text-2xl font-bold tabular-nums ${clock.warning ? 'text-warn' : ''}`}>{clock.text}</span>}
        {clock.state === 'over' && seat.color !== 'green' && <span class="text-lg font-bold text-error">Tempo esgotado</span>}
        {seat.extraTurns !== null && seat.color !== 'green' && (
          <span class="text-lg font-bold text-warn">Tempo esgotado · {seat.extraTurns} turnos extras</span>
        )}
      </div>
      <div class="flex items-center gap-2 text-lg">
        <Avatar photo={me.photo} name={me.name} cache={photos} class="size-8 text-[2rem]" />você <span class="text-muted">x</span>
        <Avatar photo={seat.opponentPhoto} name={seat.opponent} cache={photos} class="size-8 text-[2rem]" />{seat.opponent}
      </div>
      <div class="flex items-center gap-2">
        <span class={`size-3 shrink-0 rounded-full ${DOT[seat.color]}`} aria-hidden="true" />
        <span class={`font-medium ${TONE[message.tone]}`}>{message.text}</span>
      </div>
      {seat.myReport && <p class={muted}>Resultado enviado: <b class="text-text">{describeReport(seat.myReport)}</b>. Para corrigir, chame o juiz.</p>}

      {canReport && !choice && round.bestOf && (
        <div class="grid grid-cols-2 gap-2">
          {reportOptions().map((o) => (
            <button key={o.label} type="button" class={`rounded-lg px-2 py-3 font-semibold ${REPORT[o.tone]}`} onClick={() => { setChoice(o); setError(null); }}>{o.label}</button>
          ))}
        </div>
      )}
      {choice && (
        <div class="flex flex-col gap-3 rounded-xl border border-dashed border-warn p-4">
          <p class="m-0">Confirmar o resultado da <b>mesa {seat.table}</b>: <b>{choice.label}</b>?</p>
          <button type="button" class={bigPrimary} disabled={busy} onClick={() => { void send(); }}>{busy ? 'Enviando…' : 'Confirmar e enviar'}</button>
          <button type="button" class={textButton} disabled={busy} onClick={() => { setChoice(null); }}>Voltar</button>
        </div>
      )}
      <Feedback message={error ? { ok: false, text: error } : null} />
    </section>
  );
};
