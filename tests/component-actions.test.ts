import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build, createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { componentActions } from '../dist/compiler/component-library.js';
import { Runtime } from '../dist/runtime/lifecycle.js';

void test('packaged component actions extend registration, retain panel actions and invalidate artifact changes', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'paneon-component-actions-')));
  const library = join(root, 'node_modules', 'fixture-components');
  const runtime = new Runtime(join(root, 'runtime'));
  try {
    await mkdir(library, { recursive: true });
    await writeFile(
      join(library, 'package.json'),
      JSON.stringify({
        name: 'fixture-components',
        version: '1.0.0',
        type: 'module',
        exports: './dist/index.js',
        paneon: { componentActions: './dist/paneon-actions.json' },
      }),
    );
    await writeFile(
      join(library, 'index.ts'),
      "export {Probe} from './probe'; export {Empty} from './empty';",
    );
    await writeFile(
      join(library, 'empty.ts'),
      "import {createElement} from 'react';export function Empty(){return createElement('span',null,'empty fixture');}",
    );
    await writeFile(
      join(library, 'probe.ts'),
      `import {createElement} from 'react';
import {serverAction,z} from '@qoggy/paneon/sdk';import {readFile} from 'node:fs/promises';
export const read=serverAction({kind:'query',input:z.object({path:z.string()}),handler:async(ctx,input)=>'SERVER_ONLY_MARKER:'+await readFile(input.path,{encoding:'utf8',signal:ctx.signal})});
export function Probe(){return createElement('button',{onClick:()=>read({path:'data.txt'})},'Probe fixture');}`,
    );
    await build({
      configFile: false,
      root: library,
      logLevel: 'silent',
      plugins: [
        componentActions({
          entry: join(library, 'index.ts'),
          packageRoot: library,
          outDir: join(library, 'dist'),
        }),
      ],
      build: {
        outDir: join(library, 'dist'),
        lib: { entry: join(library, 'index.ts'), formats: ['es'] },
        minify: false,
        rollupOptions: {
          external: ['react', '@qoggy/paneon/sdk/client'],
          output: {
            preserveModules: true,
            preserveModulesRoot: library,
            entryFileNames: '[name].js',
          },
        },
      },
    });
    await writeFile(
      join(library, 'dist/index.d.ts'),
      "export function Probe(): import('react').ReactElement; export function Empty(): import('react').ReactElement;",
    );
    // An unnamed package scope changes ESM interpretation, not which package
    // owns the component manifest declared at the library root.
    await writeFile(join(library, 'dist/package.json'), '{"type":"module"}');
    const browserLibrary = await readFile(join(library, 'dist/probe.js'), 'utf8');
    assert.doesNotMatch(browserLibrary, /node:fs|SERVER_ONLY_MARKER/);
    const entry = join(root, 'panel.tsx');
    await writeFile(
      entry,
      `import {definePanel,serverAction,z} from '@qoggy/paneon/sdk';import {Probe} from 'fixture-components';
export const own=serverAction({kind:'query',input:z.object({}),handler:()=>42});
export default definePanel({id:'component-fixture',requires:{paneon:'*'},input:z.object({}),render:Probe});`,
    );
    await writeFile(join(root, 'data.txt'), 'read from cwd');
    const panel = await runtime.run(entry, root, {}, false);
    const manifest = runtime.manifest(panel.instanceId);
    assert.ok(manifest);
    const actions = manifest.actions;
    const component = actions.find((action) => action.id.startsWith('fixture-components@'));
    assert.ok(component);
    assert.equal(actions.length, 2);
    assert.equal(await runtime.invoke(panel.instanceId, panel.revision, 'panel.tsx#own', {}), 42);
    assert.equal(
      await runtime.invoke(panel.instanceId, panel.revision, component.id, { path: 'data.txt' }),
      'SERVER_ONLY_MARKER:read from cwd',
    );

    const output = runtime.artifact(panel.instanceId, panel.revision);
    assert.ok(output);
    const client = await readFile(join(output.directory, 'client/client.js'), 'utf8');
    assert.doesNotMatch(client, /SERVER_ONLY_MARKER|node:fs/);

    const serverFile = join(library, 'dist/actions.js');
    await writeFile(
      serverFile,
      (await readFile(serverFile, 'utf8')).replace('SERVER_ONLY_MARKER:', 'SERVER_CHANGED:'),
    );
    const changed = await runtime.run(entry, root, {}, false);
    assert.notEqual(changed.revision, panel.revision);
    assert.equal(
      await runtime.invoke(changed.instanceId, changed.revision, component.id, {
        path: 'data.txt',
      }),
      'SERVER_CHANGED:read from cwd',
    );

    const basicEntry = join(root, 'basic.tsx');
    await writeFile(
      basicEntry,
      "import {definePanel,z} from '@qoggy/paneon/sdk';import {Empty} from 'fixture-components';export default definePanel({id:'empty-fixture',requires:{paneon:'*'},input:z.object({}),render:Empty});",
    );
    const basic = await runtime.run(basicEntry, root, {}, false);
    assert.deepEqual(runtime.manifest(basic.instanceId)?.actions, []);
  } finally {
    await runtime.stop();
    await rm(root, { recursive: true, force: true });
  }
});

void test('component source edits refresh browser transforms in the development server', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'paneon-component-dev-')));
  const entry = join(root, 'index.ts');
  const probe = join(root, 'probe.ts');
  const source = (label: string) =>
    `import {serverAction,z} from '@qoggy/paneon/sdk';
export const read=serverAction({input:z.object({}),handler:()=>process.cwd()});
export function Probe(){return {label:${JSON.stringify(label)},read:()=>read({})};}`;
  await writeFile(join(root, 'package.json'), '{"name":"component-dev","version":"1.0.0"}');
  await writeFile(entry, "export {Probe} from './probe';");
  await writeFile(probe, source('before'));
  const server = await createServer({
    configFile: false,
    root,
    logLevel: 'silent',
    resolve: {
      alias: {
        '@qoggy/paneon/sdk/client': fileURLToPath(
          new URL('../dist/sdk/client.js', import.meta.url),
        ),
      },
    },
    plugins: [
      componentActions({ entry, packageRoot: root, outDir: join(root, 'dist'), emit: false }),
    ],
    server: { middlewareMode: true },
  });
  try {
    const initial = await server.transformRequest('/probe.ts');
    assert.match(initial?.code ?? '', /before/);
    assert.doesNotMatch(initial?.code ?? '', /process\.cwd/);
    const updated = new Promise<void>((resolve) => {
      server.watcher.on('change', (file) => {
        if (file === probe) resolve();
      });
    });
    await writeFile(probe, source('after'));
    await updated;
    // Vite's async change hook invalidates the transform after the FS event.
    const deadline = Date.now() + 3000;
    let next = await server.transformRequest('/probe.ts');
    while (!next?.code.includes('after') && Date.now() < deadline) {
      await delay(10);
      next = await server.transformRequest('/probe.ts');
    }
    assert.match(next?.code ?? '', /after/);
    assert.doesNotMatch(next?.code ?? '', /process\.cwd/);
  } finally {
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
});
