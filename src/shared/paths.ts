import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
export const PANEON_HOME = join(homedir(), '.paneon');
let root = dirname(fileURLToPath(import.meta.url));
while (!existsSync(join(root, 'package.json'))) {
  const parent = dirname(root);
  if (parent === root) throw new Error('Paneon package not found');
  root = parent;
}
export const PACKAGE_ROOT = root;
export const PACKAGE_VERSION = (
  JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string }
).version;
