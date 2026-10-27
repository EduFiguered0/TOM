import type { BoardResponse } from '@tom/contracts';
import { useEffect, useState } from 'preact/hooks';
import type { ApiResult } from '../api.js';
import type { PhotoCache } from '../photo/photo-cache.js';
import { PartialTv } from './partial.js';
import { Tv } from './tv.js';
import { centered } from './styles.js';
import { WaitingTv } from './waiting.js';

/** Cadência da TV: cada consulta vai à Lambda (sem cache compartilhado), dentro do gratuito. */
const POLL_MS = 5000;

type State =
  | { kind: 'loading' }
  | { kind: 'board'; board: BoardResponse; receivedAt: number }
  /** Sem sessão de ADM (401/403): a TV é extensão do painel. */
  | { kind: 'denied' };

/**
 * TV ao vivo: consulta o quadro com a sessão do ADM (a mesma do painel, aberto em "Abrir TV ↗");
 * sem conexão, continua mostrando a última rodada.
 */
export const LiveTv = ({ load, photos = null }: { load: () => Promise<ApiResult<BoardResponse>>; photos?: PhotoCache | null }) => {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [offline, setOffline] = useState(false);
  /** Sessão caiu no meio do evento: o último quadro fica, com aviso; volta sozinho quando o ADM entrar de novo. */
  const [sessionLost, setSessionLost] = useState(false);

  useEffect(() => {
    let stopped = false;
    const refresh = async () => {
      try {
        const result = await load();
        if (stopped) return;
        setOffline(false);
        if (result.ok) { setSessionLost(false); setState({ kind: 'board', board: result.body, receivedAt: Date.now() }); }
        else if (result.status === 401 || result.status === 403) {
          setSessionLost(true);
          setState((s) => (s.kind === 'board' ? s : { kind: 'denied' }));
        }
        else setOffline(true);
      } catch {
        if (!stopped) setOffline(true);
      }
    };
    void refresh();
    const timer = setInterval(() => { void refresh(); }, POLL_MS);
    return () => { stopped = true; clearInterval(timer); };
  }, [load]);

  return (
    <>
      {state.kind === 'loading' && <div class={`${centered} text-[2.4vw] text-muted`}><p class="m-0">Carregando…</p></div>}
      {state.kind === 'denied' && <TvDenied />}
      {state.kind === 'board' && (state.board.state === 'running'
        ? <Tv board={state.board} receivedAt={state.receivedAt} photos={photos} />
        : state.board.state === 'standings' ? <PartialTv board={state.board} /> : <WaitingTv board={state.board} />)}
      {sessionLost && state.kind === 'board' && (
        <div class="fixed bottom-[1.5vh] left-[2vw] rounded-[.6vw] bg-red px-[1vw] py-[.4vh] text-[1.1vw] font-semibold text-white" role="alert">
          Sessão do ADM encerrada · entre de novo no painel
        </div>
      )}
      {offline && (
        <div class="fixed bottom-[1.5vh] right-[2vw] rounded-[.6vw] bg-orange-900 px-[1vw] py-[.4vh] text-[1.1vw] font-semibold text-orange-50" role="status">
          Sem conexão · mostrando a última rodada recebida
        </div>
      )}
    </>
  );
};

/** A TV só abre com sessão de ADM: abra pelo painel ("Abrir TV ↗"). */
export const TvDenied = () => (
  <div class={`${centered} text-[2vw]`}>
    <p class="m-0 font-bold">A TV faz parte do painel do ADM.</p>
    <p class="m-0 text-muted">Entre como ADM e use "Abrir TV" no painel.</p>
    <a class="text-accent" href="/conta">Entrar</a>
  </div>
);
