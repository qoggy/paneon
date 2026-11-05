import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  isTestFile,
  testFilePresentation,
} from '#test-skill/assets/shared/test-file-presentation.ts';

void test('explicit test names are highlighted across the supported languages', () => {
  for (const path of [
    'src/cache.test.ts',
    'src/cache.spec.js',
    'ui/button.test.tsx',
    'ui/button.spec.jsx',
    'test/cache.test.mjs',
    'cache.spec.cjs',
    'cache.test.mts',
    'cache.test.cts',
    'pkg/cache_test.go',
    'tests/test_cache.py',
    'cache_test.py',
    'module/src/test/java/com/example/CacheTest.java',
    'src/test/java/CacheTests.java',
    'src/test/java/CacheTestCase.java',
    'src/test/kotlin/com/example/CacheTest.kt',
    'C:\\project\\src\\cache.test.ts',
    'C:\\project\\src\\test\\java\\CacheTest.java',
  ])
    assert.equal(isTestFile(path), true, path);
});

void test('ambiguous names, fixture samples and mixed production sources stay unmarked', () => {
  for (const path of [
    'tests/cache.ts',
    'tests/browser/file-icons.mjs',
    'tests/helpers.ts',
    'tests/testdata/cache_test.go',
    'tests/fixtures/cache.test.ts',
    '__fixtures__/test_cache.py',
    'contest.ts',
    'latest.ts',
    'test-utils.ts',
    'specification.ts',
    'src/CacheTest.java',
    'src/main/java/CacheTest.java',
    'src/test/java/TestHelper.java',
    'src/test/kotlin/TestHelper.kt',
    'src/lib.rs',
    'src/cache_test.rs',
    'tests/integration.rs',
    'test.sh',
    'cache.test.ts.snap',
    'cache.test.d.ts',
    '_hidden_test.go',
    '.hidden_test.go',
    'cache.TEST.ts',
    'test_cache.PY',
    'README.md',
    '',
  ])
    assert.equal(isTestFile(path), false, path);
});

void test('test color is decorative and yields to the existing selection state', () => {
  const marked = testFilePresentation('cache.test.ts', false);
  assert.equal(marked['data-test-file'], true);
  assert.match(marked.className, /bg-green-50/);
  const selected = testFilePresentation('cache.test.ts', true);
  assert.equal(selected['data-test-file'], true);
  assert.equal(selected.className, '');
  assert.deepEqual(testFilePresentation('tests/cache.ts', false), {
    'data-test-file': undefined,
    className: '',
  });
});
