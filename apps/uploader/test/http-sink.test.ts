import { describe, expect, it } from 'vitest';
import { ConfigError, FatalSinkError, HttpSink, MemorySentLog, Uploader, parseConfig, type Snapshot } from '../src/index.js';

const snapshot: Snapshot = {
  tournament: 'FODASE', type: 'pairings', fileName: 'FODASEpairings.html', content: '<html></html>',
  sha256: 'a'.repeat(64), modifiedAt: new Date('2026-10-24T14:00:00Z'),
};

const reply = (status: number, body: unknown) => () => Promise.resolve(new Response(JSON.stringify(body), { status }));

describe('envio para a API', () => {
  it('manda o HTML com o token no cabeçalho e registra o que a API publicou', async () => {
    const logs: string[] = [];
    const seen: { url: string; init: RequestInit }[] = [];
    const sink = new HttpSink('https://site.example/api', 'tok', (m) => logs.push(m), (url, init) => {
      seen.push({ url: (url as URL).href, init: init ?? {} });
      return reply(200, { stored: true, published: [{ division: 'Divisão Mestre', round: 3 }], note: null })();
    });
    await sink.send(snapshot);
    expect(seen[0]).toMatchObject({ url: 'https://site.example/api/uploads', init: { method: 'POST', headers: { 'x-upload-token': 'tok' } } });
    expect(JSON.parse(seen[0]?.init.body as string)).toMatchObject({ report: 'pairings', modifiedAt: '2026-10-24T14:00:00.000Z' });
    expect(logs).toEqual(['enviado FODASEpairings.html: publicada rodada 3 (Divisão Mestre)']);
  });

  it('token revogado ou torneio diferente param o enviador; falha de rede ou da API tenta de novo', async () => {
    const send = (fetchFn: typeof fetch) => new HttpSink('https://x/api/', 'tok', () => undefined, fetchFn).send(snapshot);
    await expect(send(reply(401, { error: 'invalid_token', message: 'x' }))).rejects.toThrow(FatalSinkError);
    await expect(send(reply(409, { error: 'tournament_mismatch', message: 'outro torneio' }))).rejects.toThrow(FatalSinkError);
    await expect(send(() => Promise.reject(new TypeError('fetch failed')))).rejects.toThrow(/sem conexão/);
    const server = await send(reply(500, { error: 'internal', message: 'erro' })).catch((e: unknown) => e);
    expect(server).not.toBeInstanceOf(FatalSinkError);
  });

  it('erro fatal sai do Uploader; o envio não é marcado como feito', async () => {
    const sentLog = new MemorySentLog();
    let now = 0;
    const uploader = new Uploader({
      folder: {
        list: () => Promise.resolve([{ fileName: 'FODASEpairings.html', size: 13, modifiedAt: new Date(0) }]),
        read: () => Promise.resolve('<html></html>'),
      },
      sink: { send: () => Promise.reject(new FatalSinkError('revogado')) },
      sentLog,
      clock: { now: () => new Date(now) },
      quietMs: 10,
    });
    await uploader.tick();
    now = 100;
    await expect(uploader.tick()).rejects.toThrow(FatalSinkError);
    expect(sentLog.get('FODASEpairings.html')).toBeUndefined();
  });
});

describe('configuração do envio', () => {
  const base = ['--folder', 'C:/TOM/reports', '--state', 'C:/estado/sent.json'];

  it('sem --api fica no modo de teste', () => {
    expect(parseConfig(base, {}).upload).toBeNull();
  });

  it('token pelo ambiente (fora do histórico do terminal) ou --token; só https', () => {
    expect(parseConfig([...base, '--api', 'https://x/api'], { TOM_UPLOAD_TOKEN: 'abc' }).upload).toEqual({ api: 'https://x/api', token: 'abc' });
    expect(parseConfig([...base, '--api', 'https://x/api', '--token', 'def'], {}).upload?.token).toBe('def');
    expect(() => parseConfig([...base, '--api', 'https://x/api'], {})).toThrow(ConfigError);
    expect(() => parseConfig([...base, '--api', 'http://x/api'], { TOM_UPLOAD_TOKEN: 'abc' })).toThrow(ConfigError);
  });
});
