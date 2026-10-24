import type { MyRoundResponse } from '@tom/contracts';
import { useEffect, useState } from 'preact/hooks';
import type { Api } from '../api.js';

/** ADM inicia a rodada publicada pelo TOM; o painel completo (termômetro, keys, override) vem na fase 9. */
export const StartRoundCard = ({ api }: { api: Api }) => {
  const [data, setData] = useState<MyRoundResponse | null>(null);
  const [bestOf, setBestOf] = useState<1 | 3>(3);
  const [minutes, setMinutes] = useState('30');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = async () => {
    const result = await api.myRound().catch(() => null);
    if (result?.ok) setData(result.body);
  };

  useEffect(() => { void load(); }, [api]);

  const start = async (e: Event) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const result = await api.startRound(bestOf, Number(minutes) || null);
      if (result.ok) { setMessage({ ok: true, text: 'Rodada iniciada: o cronômetro começou na TV e nos celulares.' }); await load(); }
      else setMessage({ ok: false, text: result.error.message });
    } catch (err) {
      setMessage({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const round = data?.round;
  return (
    <section class="card">
      <h2>Rodada</h2>
      {!round && <p class="muted">Nenhuma rodada publicada pelo TOM ainda.</p>}
      {round && (
        <>
          <p class="muted">{round.tournament} · Rodada {round.round} · {round.division}</p>
          {round.startedAt ? (
            <p class="ok">Iniciada às {new Date(round.startedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} · melhor de {round.bestOf}</p>
          ) : (
            <form onSubmit={(e) => { void start(e); }}>
              <label for="best-of">Formato</label>
              <select id="best-of" value={bestOf} onChange={(e) => { setBestOf(e.currentTarget.value === '1' ? 1 : 3); }}>
                <option value="3">Melhor de 3</option>
                <option value="1">Melhor de 1</option>
              </select>
              <label for="minutes">Tempo da rodada (minutos)</label>
              <input id="minutes" inputmode="numeric" value={minutes} onInput={(e) => { setMinutes(e.currentTarget.value); }} />
              <button type="submit" disabled={busy}>{busy ? 'Iniciando…' : 'Iniciar rodada'}</button>
            </form>
          )}
        </>
      )}
      {message && <p class={message.ok ? 'ok' : 'error'} role={message.ok ? 'status' : 'alert'}>{message.text}</p>}
    </section>
  );
};
