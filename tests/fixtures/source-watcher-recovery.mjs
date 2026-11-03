import assert from 'node:assert/strict';
import pino from 'pino';
import { registerHooks } from 'node:module';
import { mkdtempSync, realpathSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';

const sourceWatcher = new URL('../../dist/runtime/source-watcher.js', import.meta.url).href;
const fixture = new URL('./source-watcher-vite.mjs', import.meta.url).href;
registerHooks({
  resolve(specifier, context, next) {
    return specifier === 'vite' && context.parentURL === sourceWatcher
      ? { url: fixture, shortCircuit: true }
      : next(specifier, context);
  },
});
const { Runtime } = await import('../../dist/runtime/lifecycle.js');
const { PACKAGE_VERSION } = await import('../../dist/shared/paths.js');
const root = realpathSync(mkdtempSync(join(tmpdir(), 'paneon-watch-recovery-')));
const entry = join(root, 'panel.tsx');
mkdirSync(join(root, 'b'));
const panelSource = (value) => `import{definePanel,serverAction,z}from'@qoggy/paneon/sdk';${value}
export const read=serverAction({kind:'query',input:z.object({}),handler:()=>({value})});
export default definePanel({id:'nested-recovery',requires:{paneon:'${PACKAGE_VERSION}'},input:z.object({}),render:()=> <div>{value}</div>});`;
writeFileSync(entry, panelSource("const value='initial';"));
const runtime = new Runtime(join(root, 'data'), pino({ level: 'silent' }));
async function until(check, message) {
  const deadline = Date.now() + 20000;
  while (!check() && Date.now() < deadline) await delay(20);
  assert.ok(check(), message);
}
try {
  const panel = await runtime.run(entry, root, {}, true);
  const current = () => runtime.store.get(panel.instanceId);
  writeFileSync(entry, panelSource("import{value}from'./b/more/deep/value';"));
  await until(
    () => Boolean(current().diagnostic),
    'Missing import must report a compile diagnostic',
  );
  const before = current().revision;
  mkdirSync(join(root, 'b/more/deep'), { recursive: true });
  writeFileSync(join(root, 'b/more/deep/value.ts'), "export const value='recovered';");
  await until(
    () => !current().diagnostic && current().revision !== before,
    'Creating the missing directories and file must recover without resaving the entry',
  );
  assert.deepEqual(
    await runtime.invoke(panel.instanceId, current().revision, 'panel.tsx#read', {}),
    { value: 'recovered' },
  );
  const recoveredRevision = current().revision;
  writeFileSync(join(root, 'b/more/deep/value.ts'), "export const value='edited';");
  await until(
    () => current().revision !== recoveredRevision && !current().diagnostic,
    'A save after recovered publication must update the panel',
  );
  assert.deepEqual(
    await runtime.invoke(panel.instanceId, current().revision, 'panel.tsx#read', {}),
    { value: 'edited' },
  );
  await runtime.closePanel(panel.instanceId);
  console.log('NodeFs recovers a real panel after one nested-directory/file creation');
} finally {
  await runtime.stop();
  rmSync(root, { recursive: true, force: true });
}
