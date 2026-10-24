import type { BoardResponse } from '@tom/contracts';
import { useEffect, useState } from 'preact/hooks';
import { Tv } from './tv.js';

/** Mesmo tempo do cache do CloudFront: consultar mais rápido não traz dado mais novo. */
const POLL_MS = 5000;

type State = { kind: 'loading' } | { kind: 'empty' } | { kind: 'board'; board: BoardResponse };

/** TV ao vivo: consulta o quadro público; sem conexão, continua mostrando a última rodada. */
export const LiveTv = ({ fetchFn = (...args: Parameters<typeof fetch>) => fetch(...args) }: { fetchFn?: typeof fetch }) => {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    let stopped = false;
    const load = async () => {
      try {
        const response = await fetchFn('/api/board');
        if (stopped) return;
        setOffline(false);
        if (response.status === 404) setState({ kind: 'empty' });
        else if (response.ok) setState({ kind: 'board', board: (await response.json()) as BoardResponse });
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
      {state.kind === 'board' ? <Tv board={state.board} /> : (
        <div class="tv tv-empty">
          <p>{state.kind === 'loading' ? 'Carregando…' : 'Aguardando o TOM publicar a rodada'}</p>
        </div>
      )}
      {offline && <div class="tv-offline" role="status">Sem conexão · mostrando a última rodada recebida</div>}
    </>
  );
};
