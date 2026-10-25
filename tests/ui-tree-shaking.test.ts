import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import type { OutputChunk } from 'rolldown';
import { mkdtempSync, realpathSync, writeFileSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const { compilePanel } = (await import(
  '../dist/compiler/' + 'index.js'
)) as typeof import('../src/compiler/index.js');

function initialChunks(chunks: OutputChunk[]) {
  const byName = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));
  const initial = new Set<OutputChunk>();
  function visit(chunk: OutputChunk) {
    if (initial.has(chunk)) return;
    initial.add(chunk);
    for (const name of chunk.imports) {
      const dependency = byName.get(name);
      if (dependency) visit(dependency);
    }
  }
  for (const chunk of chunks.filter((chunk) => chunk.isEntry)) visit(chunk);
  assert.ok(initial.size > 0, 'The build must have an entry chunk.');
  return [...initial];
}

void test('management entry stays within 500 kB without unused lazy feature dependencies', async () => {
  const result = await build({ root, logLevel: 'silent', build: { write: false } });
  const output = Array.isArray(result) ? result[0] : result;
  assert.ok('output' in output);
  const initial = initialChunks(output.output.filter((item) => item.type === 'chunk'));
  const bytes = initial.reduce((sum, chunk) => sum + Buffer.byteLength(chunk.code), 0);
  assert.ok(bytes < 500_000, `Initial management JavaScript is ${bytes} bytes.`);
  assert.deepEqual(
    initial.flatMap((chunk) => chunk.dynamicImports),
    [],
    'Management must not retain lazy features that only panel content uses.',
  );
});

void test('public basic UI consumers exclude unused rich content and annotation initialization', async () => {
  const entry = fileURLToPath(new URL('../.paneon-basic-ui-consumer.js', import.meta.url));
  const result = await build({
    root,
    configFile: false,
    logLevel: 'silent',
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [
      {
        name: 'basic-ui-consumer',
        enforce: 'pre',
        resolveId: (id) => (id === entry ? entry : undefined),
        load: (id) =>
          id === entry
            ? `import { createElement } from 'react';
               import { createRoot } from 'react-dom/client';
               import { Button, TooltipProvider, UIProvider } from 'paneon/ui';
               createRoot(document.getElementById('root')).render(
                 createElement(UIProvider, null,
                   createElement(TooltipProvider, null, createElement(Button, null, 'Basic panel'))));`
            : undefined,
      },
    ],
    build: {
      write: false,
      minify: false,
      lib: { entry, formats: ['es'] },
    },
  });
  const output = Array.isArray(result) ? result[0] : result;
  assert.ok('output' in output);
  const chunks = output.output.filter((item) => item.type === 'chunk');
  const initial = initialChunks(chunks);
  assert.equal(chunks.length, initial.length, 'Basic UI must not emit unreachable lazy chunks.');
  const bytes = chunks.reduce((sum, chunk) => sum + Buffer.byteLength(chunk.code), 0);
  assert.ok(bytes < 1_000_000, `Unminified basic panel JavaScript is ${bytes} bytes.`);
  assert.deepEqual(
    initial.flatMap((chunk) => chunk.dynamicImports),
    [],
  );
});

void test('a complete basic panel client stays under two MB including SDK and styles', async () => {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'paneon-lean-client-'))),
    entry = join(directory, 'panel.tsx');
  writeFileSync(
    entry,
    `import{definePanel,z}from'paneon/sdk';import{Button}from'paneon/ui';export default definePanel({id:'lean',requires:{paneon:'0.0.0'},input:z.object({}),render:()=> <Button>Basic</Button>});`,
  );
  try {
    const compiled = await compilePanel(entry, join(directory, 'output'));
    const bytes = compiled.manifest.assets.reduce(
      (n, file) => n + statSync(join(compiled.directory, 'client', file)).size,
      0,
    );
    assert.ok(bytes < 2_000_000, `Basic panel client assets are ${bytes} bytes.`);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
