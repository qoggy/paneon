import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

void test('public annotation API configures the built-in page session without composition', async () => {
  const result = await build({
    entryPoints: ['src/ui/index.ts'],
    bundle: true,
    packages: 'external',
    format: 'esm',
    outdir: '/tmp/paneon-annotation-api-check',
    write: false,
    metafile: true,
  });
  const exports = Object.values(result.metafile.outputs).flatMap((output) => output.exports);
  for (const name of ['AnnotationText', 'useAnnotations', 'usePageAnnotations'])
    assert.ok(exports.includes(name), `${name} must be public`);
  assert.deepEqual(
    exports.filter((name) => /Feedback|^useFeedback$/.test(name)),
    [],
  );
  for (const name of [
    'AnnotationRoot',
    'AnnotationMenu',
    'AnnotationSubmitButton',
    'AnnotationTarget',
    'AnnotationSurface',
    'AnnotationToolbar',
    'AnnotationControls',
  ])
    assert.equal(exports.includes(name), false, `${name} must not require manual composition`);
});
