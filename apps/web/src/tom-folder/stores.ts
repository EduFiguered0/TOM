import type { SentLog } from '@tom/uploader/core';

const DB = 'tom-folder';
const HANDLES = 'handles';
const SENT = 'sent';
const HANDLE_KEY = 'tom';

/** Sem IndexedDB (aba anônima, bloqueio): vale só enquanto a página estiver aberta. */
const memory = new Map<string, unknown>();

const open = (idb: IDBFactory): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = idb.open(DB, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(HANDLES);
      request.result.createObjectStore(SENT);
    };
    request.onsuccess = () => { resolve(request.result); };
    request.onerror = () => { reject(request.error ?? new Error('IndexedDB indisponível')); };
  });

const run = async <T>(idb: IDBFactory | undefined, store: string, mode: IDBTransactionMode, act: (s: IDBObjectStore) => IDBRequest): Promise<T> => {
  if (!idb) throw new Error('sem IndexedDB');
  const db = await open(idb);
  return new Promise<T>((resolve, reject) => {
    const request = act(db.transaction(store, mode).objectStore(store));
    request.onsuccess = () => { resolve(request.result as T); };
    request.onerror = () => { reject(request.error ?? new Error('IndexedDB falhou')); };
  }).finally(() => { db.close(); });
};

const browserIdb = (): IDBFactory | undefined => (typeof indexedDB === 'undefined' ? undefined : indexedDB);

const get = async <T>(idb: IDBFactory | undefined, store: string, key: string): Promise<T | undefined> => {
  try {
    return await run<T | undefined>(idb, store, 'readonly', (s) => s.get(key));
  } catch {
    return memory.get(`${store}|${key}`) as T | undefined;
  }
};

const put = async (idb: IDBFactory | undefined, store: string, key: string, value: unknown): Promise<void> => {
  memory.set(`${store}|${key}`, value);
  try {
    await run(idb, store, 'readwrite', (s) => s.put(value, key));
  } catch {
    // Fica só na memória.
  }
};

/** A pasta escolhida fica lembrada entre visitas; o navegador ainda pede o clique de permissão. */
export const saveHandle = (handle: unknown, idb = browserIdb()) => put(idb, HANDLES, HANDLE_KEY, handle);
export const loadHandle = <T>(idb = browserIdb()) => get<T>(idb, HANDLES, HANDLE_KEY);

/** O que já foi enviado, por evento: recarregar não reenvia; um evento novo começa do zero. */
export const idbSentLog = (eventId: string, idb: IDBFactory | undefined = browserIdb()): SentLog => ({
  get: (fileName) => get<string>(idb, SENT, `${eventId}|${fileName}`),
  set: (fileName, sha256) => put(idb, SENT, `${eventId}|${fileName}`, sha256),
});
