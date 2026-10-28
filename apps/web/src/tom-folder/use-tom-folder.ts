import type { EventDto } from '@tom/contracts';
import { DEFAULT_QUIET_MS, FatalSinkError, Uploader, type Sink } from '@tom/uploader/core';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Api } from '../api.js';
import { browserFolder, type DirectoryLike } from './browser-folder.js';
import { afterPermission, isRetryable, tournamentChoice, type FolderState } from './status.js';
import { idbSentLog, loadHandle, saveHandle } from './stores.js';

/** Mesma cadência do enviador do notebook; o TOM grava um arquivo por vez. */
const TICK_MS = 3000;

type Handle = DirectoryLike & {
  queryPermission(options: { mode: 'read' }): Promise<PermissionState>;
  requestPermission(options: { mode: 'read' }): Promise<PermissionState>;
};

type Picker = (options: { mode: 'read' }) => Promise<Handle>;

type Last = Extract<FolderState, { kind: 'connected' }>['last'];

const picker = (): Picker | null => (window as unknown as { showDirectoryPicker?: Picker }).showDirectoryPicker ?? null;

type FilePicker = (options: { startIn?: Handle; types: { description: string; accept: Record<string, string[]> }[] }) => Promise<{ name: string }[]>;

const filePicker = (): FilePicker | null => (window as unknown as { showOpenFilePicker?: FilePicker }).showOpenFilePicker ?? null;

const sha256 = async (content: string): Promise<string> =>
  Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content))), (b) => b.toString(16).padStart(2, '0')).join('');

/**
 * Pasta do TOM conectada na área do ADM: o próprio site lê a pasta (só leitura) e envia os relatórios novos
 * para o evento ativo com o login do ADM. Sem token e sem comando. Nunca diz "conectado" sem estar enviando.
 * Vive na casca do ADM: continua enviando em qualquer aba.
 */
export const useTomFolder = (api: Api, event: EventDto | null, onChosen: () => void = () => undefined) => {
  const [folder, setState] = useState<FolderState>(picker() ? { kind: 'disconnected' } : { kind: 'unsupported' });
  const eventId = event?.id ?? null;
  const state: FolderState = eventId || folder.kind === 'unsupported' ? folder : { kind: 'no-event' };
  const handle = useRef<Handle | null>(null);
  const last = useRef<Last>(null);
  // Muda a cada pasta escolhida: o envio recomeça na pasta nova ("Trocar pasta").
  const [folderVersion, setFolderVersion] = useState(0);

  // A pasta lembrada: o navegador ainda exige o clique de permissão a cada sessão.
  useEffect(() => {
    if (!picker()) return;
    void loadHandle<Handle>().then(async (saved) => {
      if (!saved || handle.current) return; // O ADM já escolheu outra enquanto carregava.
      handle.current = saved;
      const permission = await saved.queryPermission({ mode: 'read' });
      if (handle.current === saved) setState(afterPermission({ kind: 'needs-permission', name: saved.name }, permission));
    }).catch(() => undefined);
  }, []);

  const sending = state.kind === 'connected' || state.kind === 'trouble';

  // Envio contínuo: confere a permissão antes de cada volta e mostra quando a pasta ou a conexão falham.
  useEffect(() => {
    const dir = handle.current;
    if (!sending || !dir || !eventId) return;
    let stopped = false;
    // Lido por função: a limpeza do efeito muda `stopped` enquanto uma volta espera.
    const isStopped = () => stopped;
    let busy = false;
    let networkFailed = false;
    // Marcado de dentro do envio (sink), durante `uploader.tick()`.
    const sendFailed = () => networkFailed;
    const sink: Sink = {
      async send(snapshot) {
        let result;
        try {
          result = await api.uploadAsAdmin({
            tournament: snapshot.tournament,
            report: snapshot.type,
            fileName: snapshot.fileName,
            content: snapshot.content,
            sha256: snapshot.sha256,
            modifiedAt: snapshot.modifiedAt.toISOString(),
          });
        } catch (e) {
          networkFailed = true; // Sem internet: o núcleo tenta de novo na próxima volta.
          throw e;
        }
        if (!result.ok) {
          if (isRetryable(result.status)) { networkFailed = true; throw new Error(result.error.message); }
          throw new FatalSinkError(result.error.message);
        }
        last.current = { at: new Date(), type: snapshot.type };
      },
    };
    const uploader = new Uploader({
      folder: browserFolder(dir), sink, sentLog: idbSentLog(eventId), clock: { now: () => new Date() }, hash: sha256, quietMs: DEFAULT_QUIET_MS,
    });
    const tick = async () => {
      if (stopped || busy) return;
      busy = true;
      networkFailed = false;
      let folderFailed = false;
      try {
        const permission = await dir.queryPermission({ mode: 'read' });
        if (isStopped()) return;
        if (permission !== 'granted') { stopped = true; setState({ kind: 'needs-permission', name: dir.name }); return; }
        await uploader.tick();
      } catch (e) {
        // Recusa da API (torneio de outro evento, evento encerrado): para e mostra.
        if (e instanceof FatalSinkError) { if (!isStopped()) setState({ kind: 'error', message: e.message }); stopped = true; return; }
        folderFailed = true;
      } finally {
        busy = false;
      }
      if (isStopped()) return;
      if (folderFailed) setState({ kind: 'trouble', name: dir.name, reason: 'folder' });
      else if (sendFailed()) setState({ kind: 'trouble', name: dir.name, reason: 'network' });
      else setState({ kind: 'connected', name: dir.name, last: last.current });
    };
    // Ao voltar para a aba (o navegador espaça a verificação com ela escondida), envia na hora.
    const onVisible = () => { if (document.visibilityState === 'visible') void tick(); };
    document.addEventListener('visibilitychange', onVisible);
    void tick();
    const timer = setInterval(() => { void tick(); }, TICK_MS);
    return () => { stopped = true; clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [sending, folderVersion, api, eventId]);

  const connect = () => {
    const pick = picker();
    if (!pick) return;
    void pick({ mode: 'read' }).then(async (dir) => {
      handle.current = dir;
      last.current = null;
      await saveHandle(dir);
      setState({ kind: 'connected', name: dir.name, last: null });
      setFolderVersion((v) => v + 1);
    }).catch(() => undefined); // O ADM fechou a janela sem escolher.
  };

  const allow = () => {
    const dir = handle.current;
    if (!dir) return;
    void dir.requestPermission({ mode: 'read' })
      .then((permission) => { setState(afterPermission({ kind: 'needs-permission', name: dir.name }, permission)); })
      .catch(() => { setState({ kind: 'needs-permission', name: dir.name }); });
  };

  /** Escolher arquivo: o ADM aponta o torneio do TOM que vale, mesmo com a rodada começada, e o envio recomeça. */
  const choose = () => {
    const pick = filePicker();
    if (!pick || !event) return;
    void pick({ ...(handle.current ? { startIn: handle.current } : {}), types: [{ description: 'Relatórios do TOM', accept: { 'text/html': ['.html'] } }] })
      .then(async ([file]) => {
        if (!file) return;
        const choice = tournamentChoice(file.name, event);
        if ('error' in choice) { alert(choice.error); return; }
        if (!confirm(choice.question)) return;
        const result = await api.chooseTournament(event.id, choice.tournament);
        if (!result.ok) { setState({ kind: 'error', message: result.error.message }); return; }
        onChosen();
        if (handle.current) { setState({ kind: 'connected', name: handle.current.name, last: last.current }); setFolderVersion((v) => v + 1); }
      })
      .catch(() => undefined); // O ADM fechou a janela sem escolher.
  };

  const retry = () => { setState({ kind: 'connected', name: handle.current?.name ?? '', last: last.current }); };
  /** Trocar pasta: enquanto envia, sem permissão ou depois de um erro. */
  const canChange = sending || state.kind === 'needs-permission' || state.kind === 'error';
  return { state, connect, allow, retry, choose, canRetry: state.kind === 'error' && handle.current !== null, canChange, canChoose: canChange && filePicker() !== null && event !== null };
};

export type TomFolder = ReturnType<typeof useTomFolder>;
