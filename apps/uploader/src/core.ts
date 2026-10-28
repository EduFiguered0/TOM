/** Núcleo do enviador sem nada de Node: o CLI e o site (navegador) usam o mesmo. */
export { DEFAULT_QUIET_MS, looksComplete, Uploader, type UploaderDeps } from './uploader.js';
export type { FileStat, Folder } from './folder-port.js';
export type { SentLog } from './sent-log-port.js';
export { FatalSinkError, type Sink, type Snapshot } from './sink.js';
export { identifyReportFile } from '@tom/tom-reports/files';
