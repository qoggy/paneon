import { PACKAGE_VERSION } from '../dist/shared/paths.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const { createGraph } = (await import(
  '../dist/' + 'compiler/action-transform.js'
)) as typeof import('../src/compiler/action-transform.js');
const { validateRequirement } = (await import(
  '../dist/' + 'compiler/index.js'
)) as typeof import('../src/compiler/index.js');
const { Store } = (await import(
  '../dist/' + 'runtime/store.js'
)) as typeof import('../src/runtime/store.js');
const { jsonValue } = (await import(
  '../dist/' + 'shared/types.js'
)) as typeof import('../src/shared/types.js');
import type { StoredPanel } from '../src/shared/types.js';
const { startServer } =
  (await import('./runtime-fixture.ts')) as typeof import('../src/runtime/server.js');
function temporary(fn: (root: string) => void) {
  const root = mkdtempSync(join(tmpdir(), 'paneon-test-'));
  try {
    fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
const definition = `export default definePanel({id:'test',requires:{paneon:'${PACKAGE_VERSION}'},input:z.object({}),events:{feedback:z.object({text:z.string()})},render:Panel});`;
void test('AST graph follows binding symbols, preserves UI shadowing, and removes action handlers', () =>
  temporary((root) => {
    const entry = join(root, 'panel.tsx');
    writeFileSync(
      entry,
      `import{definePanel,serverAction,z}from'@qoggy/paneon/sdk';import{readFileSync}from'node:fs';const label=readFileSync('/server-only','utf8');export const run=serverAction({input:z.object({}),handler:async()=>label});function Panel(){const label='Browser label';return <button onClick={()=>run({})}>{label}</button>}${definition}`,
    );
    const browser = createGraph(entry, 'client').sources.get(entry)!;
    assert.match(browser, /__paneonProxy/);
    assert.doesNotMatch(browser, /readFileSync|server-only|handler:/);
    assert.match(browser, /Browser label/);
    const server = createGraph(entry, 'server').sources.get(entry)!;
    assert.match(server, /readFileSync/);
    assert.doesNotMatch(server, /function Panel|render:/);
  }));
void test('AST graph rejects genuine browser Node references and dynamic action closures', () =>
  temporary((root) => {
    const entry = join(root, 'panel.tsx');
    writeFileSync(
      entry,
      `import{definePanel,z}from'@qoggy/paneon/sdk';import{readFileSync}from'node:fs';function Panel(){return <div>{readFileSync('/bad','utf8')}</div>}${definition}`,
    );
    assert.throws(() => createGraph(entry, 'client'), { code: 'BUILD_FAILED' });
    writeFileSync(
      entry,
      `import{definePanel,serverAction,z}from'@qoggy/paneon/sdk';function Panel(){const run=serverAction({input:z.object({}),handler:()=>1});return <div/>}${definition}`,
    );
    assert.throws(() => createGraph(entry, 'client'), { code: 'UNSUPPORTED_ACTION_CAPTURE' });
  }));
void test('server extraction rejects mutable top-level captures', () =>
  temporary((root) => {
    const entry = join(root, 'panel.tsx');
    writeFileSync(
      entry,
      `import{definePanel,serverAction,z}from'@qoggy/paneon/sdk';let counter=0;export const run=serverAction({input:z.object({}),handler:()=>counter++});function Panel(){return <div/>}${definition}`,
    );
    assert.throws(() => createGraph(entry, 'server'), { code: 'UNSUPPORTED_ACTION_CAPTURE' });
  }));
void test('type-only imports do not create runtime dependencies or discover actions', () =>
  temporary((root) => {
    const entry = join(root, 'panel.tsx');
    const types = join(root, 'types.ts');
    writeFileSync(
      types,
      `import{serverAction,z}from'@qoggy/paneon/sdk';export type Model={label:string};export default interface DefaultModel{label:string}export const hidden=serverAction({input:z.object({}),handler:async()=>42});`,
    );
    for (const [declaration, annotation] of [
      ["import type {Model} from './types';", 'Model'],
      ["import type Model from './types';", 'Model'],
      ["import type * as Types from './types';", 'Types.Model'],
      ["import {type Model} from './types';", 'Model'],
    ]) {
      writeFileSync(
        entry,
        `import{definePanel,serverAction,z}from'@qoggy/paneon/sdk';${declaration}export const run=serverAction({input:z.object({label:z.string()}),handler:async(_ctx,input)=>{const model:${annotation}=input;return model.label;}});function Panel(){const model:${annotation}={label:'typed'};return <div>{model.label}</div>}export default definePanel({id:'typed',requires:{paneon:'${PACKAGE_VERSION}'},input:z.object({}),render:Panel});`,
      );
      for (const side of ['client', 'server'] as const) {
        const graph = createGraph(entry, side);
        assert.equal(graph.modules.has(types), false, `${side}: ${declaration}`);
        assert.deepEqual(
          graph.actions.map((action) => action.name),
          ['run'],
        );
        assert.doesNotMatch(graph.sources.get(entry) ?? '', /from ['"]\.\/types['"]/);
      }
    }
  }));
void test('mixed type and value imports retain their runtime bindings', () =>
  temporary((root) => {
    const entry = join(root, 'panel.tsx');
    const shared = join(root, 'shared.ts');
    writeFileSync(
      shared,
      `export type Model={label:string};export const value='runtime';export default value;`,
    );
    for (const declaration of [
      "import {type Model,value} from './shared';",
      "import value,{type Model} from './shared';",
    ]) {
      writeFileSync(
        entry,
        `import{definePanel,serverAction,z}from'@qoggy/paneon/sdk';${declaration}export const run=serverAction({input:z.object({}),handler:async()=>{const model:Model={label:value};return model.label;}});function Panel(){const model:Model={label:value};return <div>{model.label}</div>}export default definePanel({id:'mixed',requires:{paneon:'${PACKAGE_VERSION}'},input:z.object({}),render:Panel});`,
      );
      for (const side of ['client', 'server'] as const) {
        const graph = createGraph(entry, side);
        assert.equal(graph.modules.has(shared), true);
        assert.match(graph.sources.get(entry) ?? '', /import .*value.* from ['"]\.\/shared['"]/);
        assert.doesNotMatch(graph.sources.get(entry) ?? '', /import .*Model.* from/);
        assert.match(graph.sources.get(shared) ?? '', /const value\s*=\s*'runtime'/);
      }
    }
  }));
void test('version preflight follows npm ranges and never evaluates imports', () =>
  temporary((root) => {
    const entry = join(root, 'panel.tsx');
    const source = `import{definePanel}from'@qoggy/paneon/sdk';throw new Error('must not evaluate');export default definePanel({requires:{paneon:'>=1.4.0 <2.0.0'}});`;
    writeFileSync(entry, source);
    assert.equal(validateRequirement(entry, '1.5.0'), '>=1.4.0 <2.0.0');
    for (const version of ['1.3.0', '2.0.0', '1.5.0-beta.1'])
      assert.throws(() => validateRequirement(entry, version), {
        code: 'PANEON_VERSION_UNSUPPORTED',
      });
    writeFileSync(entry, source.replace("'>=1.4.0 <2.0.0'", 'process.env.RANGE'));
    assert.throws(() => validateRequirement(entry, '1.5.0'), {
      code: 'INVALID_PANEON_REQUIREMENT',
    });
    assert.match(readFileSync(entry, 'utf8'), /process.env.RANGE/);
  }));
void test('JSON boundary rejects cycles, undefined, nonfinite values and nonplain objects', () => {
  for (const value of [undefined, Infinity, new Date(), { nested: undefined }])
    assert.throws(() => jsonValue(value), { code: 'INVALID_RESULT' });
  const cycle: unknown[] = [];
  cycle.push(cycle);
  assert.throws(() => jsonValue(cycle), { code: 'INVALID_RESULT' });
  assert.deepEqual(jsonValue({ text: '中文', a: [null, 2, true] }), {
    text: '中文',
    a: [null, 2, true],
  });
});
void test('SQLite events survive reopen and only explicit delivered acknowledgements advance a consumer', () =>
  temporary((root) => {
    let store = new Store(root);
    const panel: StoredPanel = {
      instanceId: '1',
      definitionId: 'd',
      status: 'running',
      entryPath: '/a.tsx',
      cwd: '/',
      params: {},
      revision: 'r',
      watch: true,
      createdAt: '2026-10-20',
      updatedAt: '2026-10-20',
      requires: { paneon: PACKAGE_VERSION },
      paneonVersion: PACKAGE_VERSION,
    };
    store.save(panel);
    store.save({ ...panel, instanceId: '2' });
    const event = store.append('1', 'r', 'feedback', { text: '中文' });
    const foreign = store.append('2', 'r', 'feedback', {});
    assert.throws(() => store.ack('1', 'agent', event.id), { code: 'INVALID_ACK' });
    assert.equal(store.read('1', 'agent', 100).events[0]?.id, event.id);
    assert.equal(store.read('1', 'agent', 100).events.length, 1);
    assert.throws(() => store.ack('1', 'agent', foreign.id), { code: 'INVALID_ACK' });
    store.ack('1', 'agent', event.id);
    assert.equal(store.read('1', 'agent', 100).events.length, 0);
    assert.equal(store.read('1', 'another', 100).events.length, 1);
    store.close();
    store = new Store(root);
    assert.equal(store.read('1', 'agent', 100).lastAckId, event.id);
    assert.equal(store.read('1', 'another', 100).events.length, 1);
    const tables = store.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as {
      name: string;
    }[];
    assert.deepEqual(
      tables
        .map((t) => t.name)
        .filter((n) => n !== 'sqlite_sequence')
        .sort(),
      ['consumers', 'events', 'panels', 'schema_meta'],
    );
    store.close();
  }));
void test('database with unsupported schema version is rejected without rewriting it', () =>
  temporary((root) => {
    const store = new Store(root);
    store.db.prepare('UPDATE schema_meta SET version=999').run();
    store.close();
    assert.throws(() => new Store(root), { code: 'DATABASE_VERSION_UNSUPPORTED' });
  }));
void test('local API requires exact Host and Origin or independent CLI control authentication', async () => {
  const root = mkdtempSync(join(tmpdir(), 'paneon-server-test-'));
  const started = await startServer(root);
  const origin = `http://127.0.0.1:${started.descriptor.port}`;
  try {
    const control = { Authorization: `Bearer ${started.descriptor.controlToken}` };
    const allowed = await fetch(origin + '/api/panels', { headers: control });
    assert.equal(allowed.status, 200);
    for (const headers of [
      {},
      { Origin: 'null' },
      { Origin: 'https://evil.example' },
      { Origin: origin + '1' },
      { ...control, Origin: 'https://evil.example' },
    ]) {
      const response = await fetch(origin + '/api/panels', { headers });
      assert.equal(response.status, 400);
    }
    assert.equal(
      (await fetch(origin + '/api/panels', { headers: { Referer: origin + '/panels/i' } })).status,
      200,
    );
    assert.equal(
      (
        await fetch(origin + '/api/panels', {
          method: 'POST',
          headers: { Referer: origin + '/panels/i', 'Content-Type': 'application/json' },
          body: '{}',
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await started.app.inject({
          method: 'GET',
          url: '/api/panels',
          headers: { host: 'evil.test', ...control },
        })
      ).statusCode,
      400,
    );
  } finally {
    await started.stop();
    rmSync(root, { recursive: true, force: true });
  }
});
