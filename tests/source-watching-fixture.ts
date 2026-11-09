import { PACKAGE_VERSION } from '../dist/shared/paths.js';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import pino from 'pino';
import type { WatchInputs } from '../src/shared/types.js';

export const { Runtime } = (await import(
  '../dist/runtime/' + 'lifecycle.js'
)) as typeof import('../src/runtime/lifecycle.js');
export const { SourceWatcher } = (await import(
  '../dist/runtime/' + 'source-watcher.js'
)) as typeof import('../src/runtime/source-watcher.js');
const { contentHash } = (await import(
  '../dist/compiler/' + 'build-inputs.js'
)) as typeof import('../src/compiler/build-inputs.js');
export const logger = pino({ level: 'silent' });
export const directory = () => realpathSync(mkdtempSync(join(tmpdir(), 'paneon-source-watch-')));
export async function until(
  check: () => boolean,
  message = 'Expected source update did not complete',
) {
  const deadline = Date.now() + 20000;
  while (!check() && Date.now() < deadline) await delay(20);
  assert.ok(check(), message);
}
export function source(specifier = './value', extra = '') {
  return `import{definePanel,serverAction,z}from'@qoggy/paneon/sdk';import{value}from'${specifier}';${extra}
export const read=serverAction({kind:'query',input:z.object({}),handler:()=>({value})});
export default definePanel({id:'source-watch',requires:{paneon:'${PACKAGE_VERSION}'},input:z.object({}),render:()=> <div>{value}</div>});`;
}
export function inputs(file: string, value: string): WatchInputs {
  return { files: { [file]: contentHash(value) }, paths: {} };
}
export function sources(runtime: InstanceType<typeof Runtime>) {
  return (runtime as unknown as { sources: InstanceType<typeof SourceWatcher> }).sources;
}
