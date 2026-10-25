import { describe, expect, it } from 'vitest';
import { MemorySentLog, Uploader, looksComplete, nodeSha256, type FileStat, type Folder, type Sink, type Snapshot } from '../src/index.js';
import { Uploader as CoreUploader, type SentLog } from '../src/core.js';

const HTML = (body: string) => `<html><body>${body}</body></html>\n`;

/** Pasta falsa: cada escrita muda tamanho e data, como o TOM regravando. */
class FakeFolder implements Folder {
  private readonly files = new Map<string, { content: string; modifiedAt: Date }>();
  constructor(private readonly clock: { now(): Date }) {}

  write(fileName: string, content: string): void {
    this.files.set(fileName, { content, modifiedAt: this.clock.now() });
  }

  list(): Promise<FileStat[]> {
    return Promise.resolve(
      [...this.files].map(([fileName, f]) => ({ fileName, size: f.content.length, modifiedAt: f.modifiedAt })),
    );
  }

  read(fileName: string): Promise<string> {
    const f = this.files.get(fileName);
    return f ? Promise.resolve(f.content) : Promise.reject(new Error('ENOENT'));
  }
}

class RecordingSink implements Sink {
  sent: Snapshot[] = [];
  failures = 0;

  send(s: Snapshot): Promise<void> {
    if (this.failures > 0) {
      this.failures--;
      return Promise.reject(new Error('sem internet'));
    }
    this.sent.push(s);
    return Promise.resolve();
  }
}

const setup = (sentLog = new MemorySentLog()) => {
  let now = new Date('2026-10-23T14:00:00Z').getTime();
  const clock = { now: () => new Date(now) };
  const folder = new FakeFolder(clock);
  const sink = new RecordingSink();
  const logs: string[] = [];
  const uploader = new Uploader({ folder, sink, sentLog, clock, hash: nodeSha256, quietMs: 1500, log: (m) => logs.push(m) });
  const tickAfter = async (ms: number) => {
    now += ms;
    await uploader.tick();
  };
  return { folder, sink, logs, sentLog, uploader, tickAfter, clock };
};

describe('looksComplete', () => {
  it('exige o fechamento </html>', () => {
    expect(looksComplete(HTML('x'))).toBe(true);
    expect(looksComplete('<html><body><table><tr>')).toBe(false);
  });
});

describe('Uploader', () => {
  it('só envia depois que o arquivo fica quieto pelo período', async () => {
    const { folder, sink, tickAfter } = setup();
    folder.write('FODASEpairings.html', HTML('r3'));
    await tickAfter(0);
    await tickAfter(1000);
    expect(sink.sent).toHaveLength(0);
    await tickAfter(600);
    expect(sink.sent.map((s) => [s.tournament, s.type, s.fileName])).toEqual([['FODASE', 'pairings', 'FODASEpairings.html']]);
    expect(sink.sent[0]?.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('arquivo mudando reinicia a espera', async () => {
    const { folder, sink, tickAfter } = setup();
    folder.write('FODASEpairings.html', HTML('a'));
    await tickAfter(0);
    await tickAfter(1000);
    folder.write('FODASEpairings.html', HTML('ab'));
    await tickAfter(1000);
    await tickAfter(1000);
    expect(sink.sent).toHaveLength(0);
    await tickAfter(600);
    expect(sink.sent[0]?.content).toBe(HTML('ab'));
  });

  it('arquivo quieto mas sem </html> não é enviado até completar', async () => {
    const { folder, sink, logs, tickAfter } = setup();
    folder.write('FODASEpairings.html', '<html><body><table>');
    await tickAfter(0);
    await tickAfter(2000);
    expect(sink.sent).toHaveLength(0);
    expect(logs.some((l) => l.includes('incompleto'))).toBe(true);
    folder.write('FODASEpairings.html', HTML('fim'));
    await tickAfter(0);
    await tickAfter(2000);
    expect(sink.sent).toHaveLength(1);
  });

  it('regravação com o mesmo conteúdo não reenvia; conteúdo novo reenvia', async () => {
    const { folder, sink, tickAfter } = setup();
    folder.write('FODASEstandings.html', HTML('r2'));
    await tickAfter(0);
    await tickAfter(2000);
    await tickAfter(1000);
    folder.write('FODASEstandings.html', HTML('r2')); // TOM regravou igual (nova data)
    await tickAfter(1000);
    await tickAfter(2000);
    expect(sink.sent).toHaveLength(1);
    folder.write('FODASEstandings.html', HTML('r3'));
    await tickAfter(1000);
    await tickAfter(2000);
    expect(sink.sent.map((s) => s.content)).toEqual([HTML('r2'), HTML('r3')]);
  });

  it('ao reiniciar, só reenvia o que mudou desde o último envio', async () => {
    const first = setup();
    first.folder.write('FODASEpairings.html', HTML('r3'));
    await first.tickAfter(0);
    await first.tickAfter(2000);
    expect(first.sink.sent).toHaveLength(1);

    const restarted = setup(first.sentLog);
    restarted.folder.write('FODASEpairings.html', HTML('r3'));
    restarted.folder.write('FODASEstandings.html', HTML('novo'));
    await restarted.tickAfter(0);
    await restarted.tickAfter(2000);
    expect(restarted.sink.sent.map((s) => s.fileName)).toEqual(['FODASEstandings.html']);
  });

  it('só envia arquivos do evento mais recente', async () => {
    const { folder, sink, logs, tickAfter } = setup();
    folder.write('Evento testepairings.html', HTML('antigo'));
    await tickAfter(10);
    folder.write('FODASEpairings.html', HTML('atual'));
    folder.write('main.css', 'body{}');
    await tickAfter(0);
    await tickAfter(2000);
    expect(sink.sent.map((s) => s.fileName)).toEqual(['FODASEpairings.html']);
    expect(logs).toContain('evento atual: "FODASE"');
  });

  it('falha no envio não marca como enviado e tenta de novo', async () => {
    const { folder, sink, logs, tickAfter } = setup();
    sink.failures = 1;
    folder.write('FODASEpairings.html', HTML('r3'));
    await tickAfter(0);
    await tickAfter(2000);
    expect(sink.sent).toHaveLength(0);
    expect(logs.some((l) => l.includes('falha no envio'))).toBe(true);
    await tickAfter(2000);
    expect(sink.sent).toHaveLength(1);
  });

  it('pasta sem relatórios do TOM não faz nada', async () => {
    const { folder, sink, tickAfter } = setup();
    folder.write('main.css', 'body{}');
    await tickAfter(0);
    await tickAfter(2000);
    expect(sink.sent).toHaveLength(0);
  });
});

describe('núcleo sem Node (o mesmo do navegador)', () => {
  it('usa o hash injetado e o registro assíncrono', async () => {
    let now = new Date('2026-10-23T14:00:00Z').getTime();
    const clock = { now: () => new Date(now) };
    const folder = new FakeFolder(clock);
    const sink = new RecordingSink();
    const stored = new Map<string, string>();
    const sentLog: SentLog = {
      get: (name) => Promise.resolve(stored.get(name)),
      set: (name, hash) => { stored.set(name, hash); return Promise.resolve(); },
    };
    const uploader = new CoreUploader({ folder, sink, sentLog, clock, hash: (c) => Promise.resolve(`h:${String(c.length)}`), quietMs: 1500 });
    folder.write('FODASEpairings.html', HTML('r3'));
    await uploader.tick();
    now += 2000;
    await uploader.tick();
    expect(sink.sent.map((x) => x.sha256)).toEqual([`h:${String(HTML('r3').length)}`]);

    // Outro "reinício" com o mesmo registro: não reenvia.
    const again = new CoreUploader({ folder, sink, sentLog, clock, hash: (c) => Promise.resolve(`h:${String(c.length)}`), quietMs: 1500 });
    await again.tick();
    now += 2000;
    await again.tick();
    expect(sink.sent).toHaveLength(1);
  });
});
