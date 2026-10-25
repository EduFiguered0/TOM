import { folderStatus, type FolderState } from '../tom-folder/status.js';
import type { TomFolder } from '../tom-folder/use-tom-folder.js';

const TONE = { ok: 'text-ok', warn: 'text-warn', error: 'text-error' } as const;
const DOT = { ok: 'bg-green', warn: 'bg-orange', error: 'bg-red' } as const;

const button = 'rounded-md border border-line bg-panel px-3 py-1.5 text-sm font-semibold text-text hover:border-accent';

/** Bloco "Pasta do TOM" da aba Evento: estado e os botões de conectar, permitir, tentar de novo e trocar. */
export const FolderBox = ({ folder }: { folder: TomFolder }) => {
  const { state } = folder;
  const status = folderStatus(state);
  return (
    <div class="flex flex-col gap-2">
      <p class={`m-0 flex items-start gap-2 text-sm ${TONE[status.tone]}`} role="status">
        <span class={`mt-1.5 size-2 shrink-0 rounded-full ${DOT[status.tone]}`} />{status.text}
      </p>
      {state.kind !== 'connected' && state.kind !== 'trouble' && state.kind !== 'unsupported' && state.kind !== 'no-event' && (
        <p class="m-0 text-xs text-muted">Envia sozinho o que o TOM gravar enquanto esta página estiver aberta.</p>
      )}
      <div class="flex flex-wrap gap-2">
        {state.kind === 'disconnected' && <button type="button" class={button} onClick={folder.connect}>Conectar pasta do TOM</button>}
        {state.kind === 'needs-permission' && <button type="button" class={button} onClick={folder.allow}>Permitir acesso à pasta {state.name}</button>}
        {folder.canRetry && <button type="button" class={button} onClick={folder.retry}>Tentar de novo</button>}
        {folder.canChange && <button type="button" class={button} onClick={folder.connect}>Trocar pasta</button>}
      </div>
    </div>
  );
};

/** Ponto e texto curto do topo: o ADM vê o envio em qualquer aba. */
export const FolderDot = ({ state }: { state: FolderState }) => {
  if (state.kind === 'no-event') return null;
  const status = folderStatus(state);
  const text = state.kind === 'connected'
    ? `Pasta do TOM: ${state.last ? `último envio ${state.last.at.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : 'nada enviado ainda'}`
    : `Pasta do TOM: ${status.tone === 'error' ? 'erro' : 'atenção'}`;
  return (
    <span class={`flex items-center gap-2 text-sm ${TONE[status.tone]}`} title={status.text}>
      <span class={`size-2 rounded-full ${DOT[status.tone]}`} />{text}
    </span>
  );
};
