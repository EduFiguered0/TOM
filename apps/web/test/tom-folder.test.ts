import { describe, expect, it } from 'vitest';
import { browserFolder, type DirectoryLike } from '../src/tom-folder/browser-folder.js';
import { afterPermission, folderStatus } from '../src/tom-folder/status.js';
import { idbSentLog } from '../src/tom-folder/stores.js';

/** Pasta falsa no formato da File System Access API. */
const directory = (files: Record<string, { content: string; at: number }>, extra: string[] = []): DirectoryLike => ({
  name: 'TOM_DATA',
  async *values() {
    for (const name of [...Object.keys(files), ...extra]) {
      await Promise.resolve();
      yield name in files
        ? { kind: 'file' as const, name, getFile: () => Promise.resolve(new File([files[name]?.content ?? ''], name, { lastModified: files[name]?.at ?? 0 })) }
        : { kind: 'directory' as const, name };
    }
  },
  getFileHandle: (name: string) => {
    const f = files[name];
    return f ? Promise.resolve({ getFile: () => Promise.resolve(new File([f.content], name, { lastModified: f.at })) }) : Promise.reject(new Error('NotFoundError'));
  },
});

describe('pasta do TOM no navegador', () => {
  it('lista só os .html, com tamanho e data', async () => {
    const folder = browserFolder(directory({
      'FODASEpairings.html': { content: '<html></html>', at: 1_700_000_000_000 },
      'notas.txt': { content: 'x', at: 1 },
    }, ['subpasta']));
    expect(await folder.list()).toEqual([{ fileName: 'FODASEpairings.html', size: 13, modifiedAt: new Date(1_700_000_000_000) }]);
    expect(await folder.read('FODASEpairings.html')).toBe('<html></html>');
  });

  it('não lê fora da pasta', async () => {
    const folder = browserFolder(directory({}));
    await expect(folder.read('../segredo.html')).rejects.toThrow('Nome de arquivo inválido');
    await expect(folder.read('a\\b.html')).rejects.toThrow('Nome de arquivo inválido');
  });

  it('registro em memória quando o IndexedDB falha: o que foi enviado não volta; outro evento envia de novo', async () => {
    const first = idbSentLog('ev1', undefined);
    await first.set('FODASEpairings.html', 'abc');
    expect(await idbSentLog('ev1', undefined).get('FODASEpairings.html')).toBe('abc');
    expect(await idbSentLog('ev2', undefined).get('FODASEpairings.html')).toBeUndefined();
  });
});

describe('estado da pasta no cartão', () => {
  it('textos do estado', () => {
    expect(folderStatus({ kind: 'unsupported' })).toEqual({ text: 'Use o Chrome ou o Edge neste notebook para conectar a pasta do TOM.', tone: 'error' });
    expect(folderStatus({ kind: 'no-event' }).text).toBe('Crie o evento para começar a enviar');
    expect(folderStatus({ kind: 'disconnected' })).toEqual({ text: 'Pasta não conectada', tone: 'warn' });
    expect(folderStatus({ kind: 'needs-permission', name: 'TOM_DATA' })).toEqual({ text: 'Sem permissão: clique em Permitir', tone: 'warn' });
    expect(folderStatus({ kind: 'connected', name: 'TOM_DATA', last: null })).toEqual({ text: 'Conectado à pasta TOM_DATA · nada enviado ainda', tone: 'ok' });
    const at = new Date(2026, 9, 24, 14, 32);
    expect(folderStatus({ kind: 'connected', name: 'TOM_DATA', last: { at, type: 'pairings' } }).text).toBe('Conectado à pasta TOM_DATA · último envio às 14:32 (pareamento)');
    expect(folderStatus({ kind: 'connected', name: 'TOM_DATA', last: { at, type: 'match_slips' } }).text).toMatch(/\(guias\)$/);
    expect(folderStatus({ kind: 'connected', name: 'TOM_DATA', last: { at, type: 'roster' } }).text).toMatch(/\(roster\)$/);
    expect(folderStatus({ kind: 'error', message: 'Falhou' })).toEqual({ text: 'Falhou', tone: 'error' });
  });

  it('perdeu a permissão: sai de conectado', () => {
    const connected = { kind: 'connected', name: 'TOM_DATA', last: null } as const;
    expect(afterPermission(connected, 'granted')).toEqual(connected);
    expect(afterPermission(connected, 'prompt')).toEqual({ kind: 'needs-permission', name: 'TOM_DATA' });
    expect(afterPermission(connected, 'denied')).toEqual({ kind: 'needs-permission', name: 'TOM_DATA' });
    expect(afterPermission({ kind: 'needs-permission', name: 'TOM_DATA' }, 'granted')).toEqual({ kind: 'connected', name: 'TOM_DATA', last: null });
  });
});
