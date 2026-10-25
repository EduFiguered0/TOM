import type { EventDto } from '@tom/contracts';
import { DEFAULT_QUIET_MS, FatalSinkError, Uploader, type Sink } from '@tom/uploader/core';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Api } from '../api.js';
import { browserFolder, type DirectoryLike } from './browser-folder.js';
import { afterPermission, folderStatus, type FolderState } from './status.js';
import { idbSentLog, loadHandle, saveHandle } from './stores.js';

/** Mesma cadência do enviador do notebook; o TOM grava um arquivo por vez. */
const TICK_MS = 3000;

type Handle = DirectoryLike & {
  queryPermission(options: { mode: 'read' }): Promise<PermissionState>;
  requestPermission(options: { mode: 'read' }): Promise<PermissionState>;
};

type Picker = (options: { mode: 'read' }) => Promise<Handle>;

const picker = (): Picker | null => (window as unknown as { showDirectoryPicker?: Picker }).showDirectoryPicker ?? null;

const sha256 = async (content: string): Promise<string> =>
  Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content))), (b) => b.toString(16).padStart(2, '0')).join('');

/**
 * Pasta do TOM conectada no painel: o próprio site lê a pasta (só leitura) e envia os relatórios novos
 * para o evento ativo com o login do ADM. Sem token e sem comando.
 */
export const FolderCard = ({ api, event }: { api: Api; event: EventDto }) => {
  const [state, setState] = useState<FolderState>(picker() ? { kind: 'disconnected' } : { kind: 'unsupported' });
  const handle = useRef<Handle | null>(null);

  // A pasta lembrada: o navegador ainda exige o clique de permissão a cada sessão.
  useEffect(() => {
    if (!picker()) return;
    void loadHandle<Handle>().then(async (saved) => {
      if (!saved) return;
      handle.current = saved;
      setState(afterPermission({ kind: 'needs-permission', name: saved.name }, await saved.queryPermission({ mode: 'read' })));
    }).catch(() => undefined);
  }, []);

  const connected = state.kind === 'connected';

  // Envio contínuo enquanto conectado: confere a permissão antes de cada volta.
  useEffect(() => {
    const dir = handle.current;
    if (!connected || !dir) return;
    const sink: Sink = {
      async send(snapshot) {
        const result = await api.uploadAsAdmin({
          tournament: snapshot.tournament,
          report: snapshot.type,
          fileName: snapshot.fileName,
          content: snapshot.content,
          sha256: snapshot.sha256,
          modifiedAt: snapshot.modifiedAt.toISOString(),
        });
        if (!result.ok) throw new FatalSinkError(result.error.message);
        setState((s) => (s.kind === 'connected' ? { ...s, last: { at: new Date(), type: snapshot.type } } : s));
      },
    };
    const uploader = new Uploader({
      folder: browserFolder(dir), sink, sentLog: idbSentLog(event.id), clock: { now: () => new Date() }, hash: sha256, quietMs: DEFAULT_QUIET_MS,
    });
    let stopped = false;
    let busy = false;
    const tick = async () => {
      if (stopped || busy) return;
      busy = true;
      try {
        const permission = await dir.queryPermission({ mode: 'read' });
        if (permission !== 'granted') { setState({ kind: 'needs-permission', name: dir.name }); return; }
        await uploader.tick();
      } catch (e) {
        // Recusa da API (torneio de outro evento, evento encerrado): para e mostra; ler a pasta falhou: tenta de novo.
        if (e instanceof FatalSinkError) { stopped = true; setState({ kind: 'error', message: e.message }); }
      } finally {
        busy = false;
      }
    };
    void tick();
    const timer = setInterval(() => { void tick(); }, TICK_MS);
    return () => { stopped = true; clearInterval(timer); };
  }, [connected, api, event.id]);

  const connect = () => {
    const pick = picker();
    if (!pick) return;
    void pick({ mode: 'read' }).then(async (dir) => {
      handle.current = dir;
      await saveHandle(dir);
      setState({ kind: 'connected', name: dir.name, last: null });
    }).catch(() => undefined); // O ADM fechou a janela sem escolher.
  };

  const allow = () => {
    const dir = handle.current;
    if (!dir) return;
    void dir.requestPermission({ mode: 'read' }).then((permission) => {
      setState(afterPermission({ kind: 'needs-permission', name: dir.name }, permission));
    });
  };

  const status = folderStatus(state);
  return (
    <div class="folder">
      <h3>Pasta do TOM</h3>
      <p class={status.tone === 'ok' ? 'ok' : status.tone === 'error' ? 'error' : 'muted'} role="status">{status.text}</p>
      {state.kind === 'disconnected' && <button type="button" onClick={connect}>Conectar pasta do TOM</button>}
      {state.kind === 'needs-permission' && <button type="button" onClick={allow}>Permitir acesso à pasta {state.name}</button>}
      {state.kind === 'error' && handle.current && (
        <button type="button" onClick={() => { setState({ kind: 'connected', name: handle.current?.name ?? '', last: null }); }}>Tentar de novo</button>
      )}
      {(state.kind === 'connected' || state.kind === 'needs-permission' || state.kind === 'error') && (
        <button type="button" class="link" onClick={connect}>Trocar pasta</button>
      )}
    </div>
  );
};
