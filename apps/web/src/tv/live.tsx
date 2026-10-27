import type { BoardResponse } from '@tom/contracts';
import { useEffect, useState } from 'preact/hooks';
import { Tv } from './tv.js';
import { freshServerTime } from './board.js';
import { centered } from './styles.js';
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
        if (response.ok) {
          const board = (await response.json()) as BoardResponse;
          // A resposta pode ter vindo do cache: o relógio da TV desconta a idade dela.
          setState({ kind: 'board', board: { ...board, serverTime: freshServerTime(board.serverTime, response.headers.get('age')) } });
        }
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
      {state.kind === 'loading' && <div class={`${centered} text-[2.4vw] text-muted`}><p class="m-0">Carregando…</p></div>}
      {state.kind === 'board' && (state.board.state === 'running' ? <Tv board={state.board} /> : <WaitingTv board={state.board} />)}
      {offline && (
        <div class="fixed bottom-[1.5vh] right-[2vw] rounded-[.6vw] bg-orange-900 px-[1vw] py-[.4vh] text-[1.1vw] font-semibold text-orange-50" role="status">
          Sem conexão · mostrando a última rodada recebida
        </div>
      )}
    </>
  );
};
