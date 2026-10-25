#!/usr/bin/env node
import { setTimeout as sleep } from 'node:timers/promises';
import { ConfigError, parseConfig } from './config.js';
import { ConsoleSink } from './console-sink.js';
import { FatalSinkError, HttpSink } from './http-sink.js';
import { LocalFolder } from './folder.js';
import { nodeSha256 } from './node-hash.js';
import { JsonFileSentLog } from './sent-log.js';
import { Uploader } from './uploader.js';

const stamp = (): string => new Date().toLocaleTimeString('pt-BR');
const log = (message: string): void => {
  console.log(`[${stamp()}] ${message}`);
};

const run = async (): Promise<void> => {
  const config = parseConfig(process.argv.slice(2));
  const uploader = new Uploader({
    folder: new LocalFolder(config.folder),
    sink: config.upload ? new HttpSink(config.upload.api, config.upload.token, log) : new ConsoleSink(log),
    sentLog: await JsonFileSentLog.open(config.statePath),
    clock: { now: () => new Date() },
    hash: nodeSha256,
    quietMs: config.quietMs,
    log,
  });
  const destination = config.upload ? `enviando para ${config.upload.api}` : 'modo de teste: nada sai da máquina (use --api)';
  log(`observando ${config.folder} (somente leitura) · ${destination} · estado em ${config.statePath} · Ctrl+C para sair`);

  const controller = new AbortController();
  process.once('SIGINT', () => {
    controller.abort();
  });
  while (!controller.signal.aborted) {
    try {
      await uploader.tick();
    } catch (e) {
      if (e instanceof FatalSinkError) {
        log(`envio interrompido: ${e.message}`);
        process.exitCode = 2;
        break;
      }
      log(`erro lendo a pasta: ${e instanceof Error ? e.message : String(e)}`);
    }
    await sleep(config.intervalMs, undefined, { signal: controller.signal }).catch(() => undefined);
  }
  log('encerrado');
};

run().catch((e: unknown) => {
  console.error(e instanceof ConfigError ? e.message : e);
  process.exitCode = 1;
});
