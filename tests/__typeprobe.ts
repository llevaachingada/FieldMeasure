import { readFileSync, existsSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';

export const probe = (p: string): string => {
  const b = readFileSync(p);
  const b64: string = b.toString('base64');
  return join(dirname(p), basename(p)) + b64 + String(existsSync(p)) + Buffer.from(b64, 'base64').length;
};
