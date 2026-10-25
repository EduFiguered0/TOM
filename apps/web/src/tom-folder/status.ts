export type FolderState =
  | { kind: 'unsupported' }
  | { kind: 'no-event' }
  | { kind: 'disconnected' }
  | { kind: 'needs-permission'; name: string }
  | { kind: 'connected'; name: string; last: { at: Date; type: string } | null }
  /** Continua tentando, mas não está enviando: pasta sumiu ou sem conexão com o site. */
  | { kind: 'trouble'; name: string; reason: 'folder' | 'network' }
  | { kind: 'error'; message: string };

const REPORT: Record<string, string> = { pairings: 'pareamento', match_slips: 'guias', standings: 'classificação' };

/** Linha de estado do cartão; nunca diz "conectado" sem poder ler a pasta. */
export const folderStatus = (state: FolderState): { text: string; tone: 'ok' | 'warn' | 'error' } => {
  switch (state.kind) {
    case 'unsupported':
      return { text: 'Use o Chrome ou o Edge neste notebook para conectar a pasta do TOM.', tone: 'error' };
    case 'no-event':
      return { text: 'Crie o evento para começar a enviar', tone: 'warn' };
    case 'disconnected':
      return { text: 'Pasta não conectada', tone: 'warn' };
    case 'needs-permission':
      return { text: 'Sem permissão: clique em Permitir', tone: 'warn' };
    case 'connected': {
      if (!state.last) return { text: `Conectado à pasta ${state.name} · nada enviado ainda`, tone: 'ok' };
      const time = state.last.at.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      return { text: `Conectado à pasta ${state.name} · último envio às ${time} (${REPORT[state.last.type] ?? state.last.type})`, tone: 'ok' };
    }
    case 'trouble':
      return state.reason === 'folder'
        ? { text: `Não consegui ler a pasta ${state.name}. Confira se ela ainda existe; tentando de novo…`, tone: 'warn' }
        : { text: 'Sem conexão com o site. Tentando de novo…', tone: 'warn' };
    case 'error':
      return { text: state.message, tone: 'error' };
  }
};

/** Antes de cada volta o navegador diz se ainda pode ler a pasta: sem "granted", pede o clique de novo. */
export const afterPermission = (
  state: Extract<FolderState, { kind: 'connected' | 'needs-permission' }>,
  permission: PermissionState,
): FolderState => {
  if (permission !== 'granted') return { kind: 'needs-permission', name: state.name };
  return state.kind === 'connected' ? state : { kind: 'connected', name: state.name, last: null };
};

/** Erro do servidor ou excesso de pedidos passa sozinho: tenta de novo. Recusa de regra (4xx) para e mostra. */
export const isRetryable = (status: number): boolean => status >= 500 || status === 429;
