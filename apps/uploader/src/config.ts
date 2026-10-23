import { homedir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { DEFAULT_QUIET_MS } from './uploader.js';

export interface UploaderConfig {
  folder: string;
  statePath: string;
  intervalMs: number;
  quietMs: number;
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

export const parseConfig = (argv: string[]): UploaderConfig => {
  const { values } = parseArgs({
    args: argv,
    options: {
      folder: { type: 'string' },
      state: { type: 'string' },
      interval: { type: 'string', default: '1000' },
      quiet: { type: 'string', default: String(DEFAULT_QUIET_MS) },
    },
  });
  if (!values.folder) throw new ConfigError('Informe a pasta de relatórios do TOM: --folder <caminho>');
  const folder = resolve(values.folder);
  const statePath = resolve(values.state ?? join(homedir(), '.tom-uploader', 'sent.json'));
  // O enviador nunca escreve na pasta do TOM.
  if (isInside(statePath, folder)) throw new ConfigError('--state não pode ficar dentro da pasta do TOM');
  return {
    folder,
    statePath,
    intervalMs: positiveInt(values.interval, 'interval'),
    quietMs: positiveInt(values.quiet, 'quiet'),
  };
};
