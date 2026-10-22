import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
const { createGraph } = (await import(
  '../dist/' + 'compiler/action-transform.js'
)) as typeof import('../src/compiler/action-transform.js');
const { Runtime } = (await import(
  '../dist/' + 'runtime/lifecycle.js'
)) as typeof import('../src/runtime/lifecycle.js');
const { version } = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as { version: string };
async function fixture(
  files: Record<string, string>,
  run: (root: string, entry: string) => Promise<void> | void,
) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'paneon-exports-')));
  try {
    for (const [name, source] of Object.entries(files)) {
      const file = join(root, name);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, source);
    }
    await run(root, join(root, 'panel.tsx'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
async function evaluate(entry: string, graph = createGraph(entry, 'client')) {
  const bundle = await build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'browser',
    logLevel: 'silent',
    plugins: [
      {
        name: 'extracted-graph',
        setup(builder) {
          builder.onLoad({ filter: /\.[jt]sx?$/ }, (args) =>
            graph.sources.has(args.path)
              ? { contents: graph.sources.get(args.path), loader: 'tsx' }
              : undefined,
          );
        },
      },
    ],
  });
  const output = join(dirname(entry), 'browser-bundle.cjs');
  writeFileSync(output, bundle.outputFiles[0].text);
  const module = createRequire(entry)(output) as { default: { render: () => unknown } };
  return module.default.render();
}
const panel = (imports: string, expression: string) =>
  `${imports}export default {render:()=>(${expression})};`;
void test('named barrel exports prune the declaration and forward exactly the requested binding', async () => {
  await fixture(
    {
      'panel.tsx': panel("import {first} from './barrel';", 'first'),
      'barrel.ts': "export {first,second} from './values';export {danger} from './node-only';",
      'values.ts': "export const first='selected';export const second='unselected';",
      'node-only.ts':
        "import {readFileSync} from 'node:fs';export const danger=readFileSync('/unrelated','utf8');",
    },
    async (root, entry) => {
      const graph = createGraph(entry, 'client');
      assert.match(graph.sources.get(join(root, 'barrel.ts')) ?? '', /export\s*\{\s*first\s*\}/);
      assert.doesNotMatch(
        [...graph.sources.values()].join('\n'),
        /second|unselected|danger|unrelated|node:fs/,
      );
      assert.equal(graph.modules.has(join(root, 'node-only.ts')), false);
      assert.equal(await evaluate(entry, graph), 'selected');
    },
  );
});
void test('renamed exports preserve every alias including default forwarding across barrels', async () => {
  await fixture(
    {
      'panel.tsx': panel("import {answer, label} from './barrel';", '[answer,label]'),
      'barrel.ts':
        "export {intermediate as answer} from './middle';export {default as label} from './values';",
      'middle.ts': "export {first as intermediate,second as unused} from './values';",
      'values.ts':
        "export const first=42;export const second=99;const text='default label';export default text;",
    },
    async (root, entry) => {
      const graph = createGraph(entry, 'client');
      assert.doesNotMatch(graph.sources.get(join(root, 'middle.ts')) ?? '', /second|unused/);
      assert.deepEqual(await evaluate(entry, graph), [42, 'default label']);
    },
  );
});
void test('string export aliases remain valid when forwarded by a star barrel', async () => {
  await fixture(
    {
      'panel.tsx': panel('import {"display-name" as value} from "./barrel";', 'value'),
      'barrel.ts': "export * from './middle';",
      'middle.ts': 'const value="string alias";export {value as "display-name"};',
    },
    async (_root, entry) => assert.equal(await evaluate(entry), 'string alias'),
  );
});
void test('local export clauses resolve imported aliases and unexported local declarations', async () => {
  await fixture(
    {
      'panel.tsx': panel("import value,{answer} from './barrel';", '[value,answer]'),
      'barrel.ts':
        "import {first as local,second} from './values';const value=local+' local';const ignored=second;export {local as answer,value as default,ignored};",
      'values.ts': "export const first='bound';export const second='unused';",
    },
    async (root, entry) => {
      const graph = createGraph(entry, 'client');
      assert.doesNotMatch(graph.sources.get(join(root, 'barrel.ts')) ?? '', /ignored|second/);
      assert.deepEqual(await evaluate(entry, graph), ['bound local', 'bound']);
    },
  );
});
void test('type-only re-exports never load their modules or discover their actions', async () => {
  await fixture(
    {
      'panel.tsx': panel("import {value} from './barrel';", 'value'),
      'barrel.ts':
        "export type {Model} from './types';export type * from './types';export {type Model as Shape,value} from './values';",
      'values.ts': "export type Model={label:string};export const value='typed';",
      'types.ts':
        "import {serverAction,z} from 'paneon/sdk';export type Model={x:number};export const hidden=serverAction({input:z.object({}),handler:()=>1});",
    },
    async (root, entry) => {
      for (const side of ['client', 'server'] as const) {
        const graph = createGraph(entry, side);
        assert.equal(graph.modules.has(join(root, 'types.ts')), false);
        assert.deepEqual(graph.actions, []);
        assert.doesNotMatch(graph.sources.get(join(root, 'barrel.ts')) ?? '', /Model|Shape|types/);
      }
      assert.equal(await evaluate(entry), 'typed');
    },
  );
});
void test('namespace imports and namespace re-exports retain only public runtime bindings', async () => {
  await fixture(
    {
      'panel.tsx': panel(
        "import * as direct from './values';import {group} from './barrel';",
        '[direct.first,direct.second,group.first,Object.keys(group).sort()]',
      ),
      'barrel.ts': "export * as group from './values';export {danger} from './node-only';",
      'values.ts':
        "import {readFileSync} from 'node:fs';const privateValue=readFileSync('/private','utf8');export type Model={x:number};export const first=1;export const second=2;export default 3;",
      'node-only.ts': "export {readFileSync as danger} from 'node:fs';",
    },
    async (root, entry) => {
      const graph = createGraph(entry, 'client');
      assert.doesNotMatch(
        [...graph.sources.values()].join('\n'),
        /private|readFileSync|node:fs|danger/,
      );
      assert.equal(graph.modules.has(join(root, 'node-only.ts')), false);
      assert.deepEqual(await evaluate(entry, graph), [1, 2, 1, ['default', 'first', 'second']]);
    },
  );
});
void test('star export cycles terminate and explicit exports override stars without exposing default', async () => {
  await fixture(
    {
      'panel.tsx': panel("import {first,preferred} from './barrel';", '[first,preferred]'),
      'barrel.ts':
        "export * from './loop';export * from './values';export {chosen as preferred} from './override';",
      'loop.ts': "export * from './barrel';",
      'values.ts':
        "export const first='cycle value';export const preferred='wrong';export const unused=9;export default 'not forwarded';",
      'override.ts': "export const chosen='explicit';",
    },
    async (root, entry) => {
      const graph = createGraph(entry, 'client');
      assert.doesNotMatch(graph.sources.get(join(root, 'barrel.ts')) ?? '', /export\s*\*/);
      assert.doesNotMatch(graph.sources.get(join(root, 'values.ts')) ?? '', /wrong|unused|default/);
      assert.deepEqual(await evaluate(entry, graph), ['cycle value', 'explicit']);
    },
  );
});
void test('selected external Node exports are rejected for named, star, and namespace paths', async () => {
  for (const declaration of [
    "export {readFileSync as value} from 'node:fs';",
    "export {readFileSync as value} from 'fs';",
    "export * from 'node:fs';",
    "export * as value from 'node:fs';",
  ]) {
    await fixture(
      {
        'panel.tsx': panel(
          `import {${declaration.includes('export * from') ? 'readFileSync as value' : 'value'}} from './barrel';`,
          'value',
        ),
        'barrel.ts': declaration,
      },
      (_root, entry) => assert.throws(() => createGraph(entry, 'client'), { code: 'BUILD_FAILED' }),
    );
  }
});
void test('nested external stars retain the requested edge and enforce Node isolation', async () => {
  for (const imported of ['{readFileSync as value}', '* as value']) {
    await fixture(
      {
        'panel.tsx': panel(`import ${imported} from './barrel';`, 'value'),
        'barrel.ts': "export * from './middle';",
        'middle.ts': "export * from 'node:fs';",
      },
      (_root, entry) => assert.throws(() => createGraph(entry, 'client'), { code: 'BUILD_FAILED' }),
    );
  }
  await fixture(
    {
      'panel.tsx': panel("import {value} from './barrel';", 'value'),
      'barrel.ts': "export * from './middle';",
      'middle.ts': "export * from 'browser-package';",
    },
    (root, entry) => {
      const graph = createGraph(entry, 'client');
      assert.match(
        graph.sources.get(join(root, 'middle.ts')) ?? '',
        /export \{ value \} from 'browser-package'/,
      );
    },
  );
});
void test('star inspection does not register unrelated actions or override explicit exports', async () => {
  await fixture(
    {
      'panel.tsx': panel("import {first,preferred} from './barrel';", '[first,preferred]'),
      'barrel.ts':
        "export * from './values';export * from './unrelated';export {chosen as preferred} from './override';",
      'values.ts': "export const first='selected';",
      'override.ts': "export const chosen='explicit';",
      'unrelated.ts':
        "import {serverAction,z} from 'paneon/sdk';import {readFileSync} from 'node:fs';export const preferred='wrong';export const hidden=serverAction({input:z.object({}),handler:()=>readFileSync('/hidden','utf8')});",
    },
    async (root, entry) => {
      for (const side of ['client', 'server'] as const) {
        const graph = createGraph(entry, side);
        assert.deepEqual(graph.actions, []);
        assert.equal(graph.sources.get(join(root, 'unrelated.ts')) ?? '', '');
      }
      assert.deepEqual(await evaluate(entry), ['selected', 'explicit']);
    },
  );
});
void test('default function and class exports remain addressable through aliases', async () => {
  for (const declaration of [
    "export default function(){return 'function';}",
    "export default class {static text='class'}",
  ]) {
    await fixture(
      {
        'panel.tsx': panel(
          "import {value} from './barrel';",
          declaration.includes('function') ? 'value()' : 'value.text',
        ),
        'barrel.ts': "export {default as value} from './values';",
        'values.ts': declaration,
      },
      async (_root, entry) =>
        assert.equal(
          await evaluate(entry),
          declaration.includes('function') ? 'function' : 'class',
        ),
    );
  }
});
void test('action aliases through a barrel keep client proxies and exclude unrelated action branches', async () => {
  await fixture(
    {
      'panel.tsx':
        "import {definePanel,z} from 'paneon/sdk';import {invoke} from './barrel';function Panel(){return <button onClick={()=>invoke({})}>Run</button>}export default definePanel({id:'actions',requires:{paneon:'*'},input:z.object({}),render:Panel});",
      'barrel.ts': "export {read as invoke} from './actions';export {hidden} from './hidden';",
      'actions.ts':
        "import {serverAction,z} from 'paneon/sdk';import {readFileSync} from 'node:fs';const value=()=>readFileSync('/server-only','utf8');export const read=serverAction({kind:'query',input:z.object({}),handler:()=>value()});",
      'hidden.ts':
        "import {serverAction,z} from 'paneon/sdk';export const hidden=serverAction({input:z.object({}),handler:()=>99});",
    },
    (root, entry) => {
      const client = createGraph(entry, 'client');
      assert.doesNotMatch(
        [...client.sources.values()].join('\n'),
        /readFileSync|server-only|handler:|hidden/,
      );
      assert.match(
        client.sources.get(join(root, 'actions.ts')) ?? '',
        /__paneonProxy\("actions.ts#read","query"\)/,
      );
      const server = createGraph(entry, 'server');
      assert.deepEqual(
        server.actions.map((a) => a.id),
        ['actions.ts#read'],
      );
      assert.match(server.sources.get(join(root, 'actions.ts')) ?? '', /readFileSync/);
      assert.equal(server.modules.has(join(root, 'hidden.ts')), false);
    },
  );
});
void test(
  'real panel compilation and worker invocation support aliased barrel actions',
  { timeout: 120000 },
  async () => {
    await fixture(
      {
        'panel.tsx': `import {definePanel,z} from 'paneon/sdk';import {invoke,label} from './barrel';function Panel(){return <button onClick={()=>invoke({suffix:'!'})}>{label}</button>}export default definePanel({id:'barrel-runtime',requires:{paneon:${JSON.stringify(version)}},input:z.object({}),render:Panel});`,
        'barrel.ts':
          "export {read as invoke} from './actions';export {first as label,second} from './values';export {unused} from './unrelated';",
        'values.ts': "export const first='Browser label';export const second='must be pruned';",
        'actions.ts':
          "import {serverAction,z} from 'paneon/sdk';import {fromPath} from './server-barrel';export const read=serverAction({kind:'query',input:z.object({suffix:z.string()}),handler:(_ctx,input)=>fromPath('/SERVER_IMPLEMENTATION_ONLY/result')+input.suffix});",
        'server-barrel.ts': "export {basename as fromPath,dirname} from 'node:path';",
        'unrelated.ts':
          "import {readFileSync} from 'node:fs';export const unused=readFileSync('/must-never-evaluate','utf8');",
      },
      async (root, entry) => {
        const runtime = new Runtime(join(root, 'runtime'));
        try {
          const instance = await runtime.run(entry, root, {}, false);
          assert.deepEqual(
            await runtime.invoke(instance.instanceId, instance.revision, 'actions.ts#read', {
              suffix: '!',
            }),
            'result!',
          );
          const graph = createGraph(entry, 'client');
          assert.doesNotMatch(
            [...graph.sources.values()].join('\n'),
            /SERVER_IMPLEMENTATION_ONLY|must-never-evaluate|must be pruned|node:path|node:fs/,
          );
          const client = readFileSync(
            join(
              root,
              'runtime',
              'panels',
              instance.instanceId,
              instance.revision.replace(':', '-'),
              'client',
              'client.js',
            ),
            'utf8',
          );
          assert.doesNotMatch(
            client,
            /SERVER_IMPLEMENTATION_ONLY|must-never-evaluate|must be pruned|node:path|node:fs/,
          );
          assert.match(client, /Browser label/);
          assert.deepEqual(
            runtime.manifest(instance.instanceId)?.actions.map((action) => action.id),
            ['actions.ts#read'],
          );
        } finally {
          await runtime.stop();
        }
      },
    );
  },
);
