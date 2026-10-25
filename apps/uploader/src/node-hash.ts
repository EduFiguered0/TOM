import { createHash } from 'node:crypto';

/** SHA-256 em hexadecimal para o enviador do notebook. */
export const nodeSha256 = (content: string): Promise<string> => Promise.resolve(createHash('sha256').update(content).digest('hex'));
