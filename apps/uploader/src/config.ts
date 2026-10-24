import { homedir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { DEFAULT_QUIET_MS } from './uploader.js';

export interface UploaderConfig {
  folder: string;
  statePath: string;
  intervalMs: number;
  quietMs: number;
  /** Sem API: só registra no console o que enviaria (modo de teste). */
  upload: { api: string; token: string } | null;
}

export class ConfigError extends Error {
  override name = 'ConfigError';
}

const positiveInt = (value: string, name: string): number => {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new ConfigError(`--${name} deve ser inteiro positivo (ms)`);
  return n;
};

const isInside = (child: string, parent: string): boolean => {
  const rel = relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
};

export const parseConfig = (argv: string[], env: Record<string, string | undefined> = process.env): UploaderConfig => {
  const { values } = parseArgs({
    args: argv,
    options: {
      folder: { type: 'string' },
      state: { type: 'string' },
      interval: { type: 'string', default: '1000' },
      quiet: { type: 'string', default: String(DEFAULT_QUIET_MS) },
      api: { type: 'string' },
      token: { type: 'string' },
    },
  });
  if (!values.folder) throw new ConfigError('Informe a pasta de relatórios do TOM: --folder <caminho>');
  const folder = resolve(values.folder);
  const statePath = resolve(values.state ?? join(homedir(), '.tom-uploader', 'sent.json'));
  // O enviador nunca escreve na pasta do TOM.
  if (isInside(statePath, folder)) throw new ConfigError('--state não pode ficar dentro da pasta do TOM');
  // O token de preferência vem do ambiente: argumentos ficam no histórico do terminal.
  const token = values.token ?? env['TOM_UPLOAD_TOKEN'];
  if (values.api && !token) throw new ConfigError('Informe o token do evento: variável TOM_UPLOAD_TOKEN (ou --token)');
  if (values.api && !values.api.startsWith('https://')) throw new ConfigError('--api deve usar https://');
  return {
    folder,
    statePath,
    upload: values.api && token ? { api: values.api, token } : null,
    intervalMs: positiveInt(values.interval, 'interval'),
    quietMs: positiveInt(values.quiet, 'quiet'),
  };
};
