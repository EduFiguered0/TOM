import type { BoardResponse } from '@tom/contracts';
import { useEffect, useState } from 'preact/hooks';
import { Tv } from './tv.js';
import { WaitingTv } from './waiting.js';

/** Mesmo tempo do cache do CloudFront: consultar mais rápido não traz dado mais novo. */
const POLL_MS = 5000;

type State = { kind: 'loading' } | { kind: 'board'; board: BoardResponse };

/** Referência estável: uma função nova a cada render reiniciaria o efeito e viraria um laço de consultas. */
const browserFetch: typeof fetch = (...args) => fetch(...args);

/** TV ao vivo: consulta o quadro público; sem conexão, continua mostrando a última rodada. */
export const LiveTv = ({ fetchFn = browserFetch }: { fetchFn?: typeof fetch }) => {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    let stopped = false;
    const load = async () => {
      try {
        const response = await fetchFn('/api/board');
        if (stopped) return;
        setOffline(false);
        if (response.ok) setState({ kind: 'board', board: (await response.json()) as BoardResponse });
        else setOffline(true);
      } catch {
        if (!stopped) setOffline(true);
      }
    };
    void load();
    const timer = setInterval(() => { void load(); }, POLL_MS);
    return () => { stopped = true; clearInterval(timer); };
  }, [fetchFn]);

  return (
    <>
      {state.kind === 'loading' && <div class="tv tv-empty"><p>Carregando…</p></div>}
      {state.kind === 'board' && (state.board.state === 'running' ? <Tv board={state.board} /> : <WaitingTv board={state.board} />)}
      {offline && <div class="tv-offline" role="status">Sem conexão · mostrando a última rodada recebida</div>}
    </>
  );
};
