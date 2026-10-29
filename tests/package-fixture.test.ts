import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, readFile, readlink, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { createPackageFixture } = (await import('./' + 'package-fixture.mjs')) as {
  createPackageFixture(
    this: void,
    root: string,
  ): Promise<{ installation: string; packageRoot: string; tarball: string }>;
};

void test('package suites clone one real installation without sharing mutable files or losing npm bin links', async () => {
  const root = await mkdtemp(join(tmpdir(), 'paneon-package-clones-'));
  const previous = process.env.PANEON_TEST_PACKAGE_BASE;
  try {
    const base = join(root, 'base');
    const pkg = join(base, 'installation/node_modules/@qoggy/paneon');
    await mkdir(join(pkg, 'dist/cli'), { recursive: true });
    await mkdir(join(base, 'installation/node_modules/.bin'));
    await writeFile(
      join(base, 'metadata.json'),
      JSON.stringify({ filename: 'package.tgz', version: '1.2.3' }),
    );
    await writeFile(join(base, 'package.tgz'), 'identical packed bytes');
    await writeFile(join(pkg, 'package.json'), '{"version":"1.2.3"}');
    await writeFile(join(pkg, 'dist/cli/index.js'), 'original');
    await symlink(
      '../@qoggy/paneon/dist/cli/index.js',
      join(base, 'installation/node_modules/.bin/paneon'),
    );
    process.env.PANEON_TEST_PACKAGE_BASE = base;
    const first = join(root, 'first');
    const second = join(root, 'second');
    await Promise.all([mkdir(first), mkdir(second)]);
    const [a, b] = await Promise.all([createPackageFixture(first), createPackageFixture(second)]);
    await writeFile(join(a.packageRoot, 'dist/cli/index.js'), 'changed only in first suite');
    assert.equal(await readFile(join(b.packageRoot, 'dist/cli/index.js'), 'utf8'), 'original');
    assert.equal(await readFile(join(pkg, 'dist/cli/index.js'), 'utf8'), 'original');
    assert.equal(await readFile(b.tarball, 'utf8'), 'identical packed bytes');
    assert.equal(
      await readlink(join(b.installation, 'node_modules/.bin/paneon')),
      '../@qoggy/paneon/dist/cli/index.js',
    );
    assert.equal(
      await readFile(join(b.installation, 'node_modules/.bin/paneon'), 'utf8'),
      'original',
    );
  } finally {
    if (previous === undefined) delete process.env.PANEON_TEST_PACKAGE_BASE;
    else process.env.PANEON_TEST_PACKAGE_BASE = previous;
    await rm(root, { recursive: true, force: true });
  }
});
