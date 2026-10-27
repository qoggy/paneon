import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

void test('public UI owns rich renderers without depending on installed skill assets', async () => {
  const result = await build({
    entryPoints: ['src/ui/index.ts'],
    bundle: true,
    packages: 'external',
    format: 'esm',
    outdir: '/tmp/paneon-promoted-ui-exports',
    write: false,
    metafile: true,
  });
  const names = Object.values(result.metafile.outputs).flatMap((output) => output.exports);
  for (const name of ['DiffView', 'Markdown', 'useUI']) assert.ok(names.includes(name), name);
  for (const name of [
    'validateTextRange',
    'validSourceRange',
    'MarkdownAnnotation',
    'DiffToolbar',
    'DiffColumns',
  ])
    assert.equal(names.includes(name), false, name + ' stays private');
  assert.equal(
    Object.keys(result.metafile.inputs).some((path) => path.includes('skills/paneon')),
    false,
  );
});
