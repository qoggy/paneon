import assert from 'node:assert/strict';
import pino from 'pino';
import { registerHooks } from 'node:module';
import { mkdtempSync, realpathSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { watchState } from '../watch-state-fixture.ts';

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
const errors = [];
const runtime = new Runtime(
  join(root, 'data'),
  pino({ level: 'error' }, { write: (line) => errors.push(JSON.parse(line)) }),
);
// Match the parent's existing whole-fixture hang guard rather than imposing a
// shorter deadline on each real compilation under concurrent test load.
const signal = AbortSignal.timeout(60000);
try {
  console.log('NodeFs recovery: initial compilation');
  const panel = await runtime.run(entry, root, {}, true);
  const current = () => runtime.store.get(panel.instanceId);
  console.log('NodeFs recovery: missing import diagnostic');
  await watchState(
    runtime,
    panel.instanceId,
    () => writeFileSync(entry, panelSource("import{value}from'./b/more/deep/value';")),
    (state) => state.diagnostic?.code === 'BUILD_FAILED',
    signal,
  );
  const before = current().revision;
  console.log('NodeFs recovery: nested directory and file creation');
  await watchState(
    runtime,
    panel.instanceId,
    () => {
      mkdirSync(join(root, 'b/more/deep'), { recursive: true });
      writeFileSync(join(root, 'b/more/deep/value.ts'), "export const value='recovered';");
    },
    (state) => !state.diagnostic && state.revision !== before,
    signal,
  );
  assert.deepEqual(
    await runtime.invoke(panel.instanceId, current().revision, 'panel.tsx#read', {}),
    { value: 'recovered' },
  );
  const recoveredRevision = current().revision;
  console.log('NodeFs recovery: editing the recovered dependency');
  await watchState(
    runtime,
    panel.instanceId,
    () => writeFileSync(join(root, 'b/more/deep/value.ts'), "export const value='edited';"),
    (state) => state.revision !== recoveredRevision && !state.diagnostic,
    signal,
  );
  assert.deepEqual(
    await runtime.invoke(panel.instanceId, current().revision, 'panel.tsx#read', {}),
    { value: 'edited' },
  );
  await runtime.closePanel(panel.instanceId);
  console.log('NodeFs recovers a real panel after one nested-directory/file creation');
} catch (error) {
  console.error('NodeFs recovery diagnostics:', {
    errors,
    watched: await runtime.sources.getWatched(),
    panels: runtime.store.list(),
  });
  throw error;
} finally {
  await runtime.stop();
  rmSync(root, { recursive: true, force: true });
}
