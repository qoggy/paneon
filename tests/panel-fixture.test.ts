import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { validateRequirement } from '../dist/compiler/index.js';
import { PACKAGE_VERSION, copyPanelFixtures, readPanelFixture } from './panel-fixture.ts';

// Synthetic versions are fixed test data; only PACKAGE_VERSION follows releases.
const FIXTURE_VERSIONS = [PACKAGE_VERSION, '0.2.0', '0.3.0'];
const UNSUPPORTED_VERSION = '0.0.0';

void test('browser fixture templates follow the current package and synthetic versions', async () => {
  const directory = new URL('./browser/', import.meta.url);
  const templates = (await readdir(directory)).filter((name) => name.endsWith('-fixture.txt'));
  assert.ok(templates.length > 0);
  for (const name of templates) {
    const path = new URL(name, directory);
    for (const version of FIXTURE_VERSIONS) {
      const source = await readPanelFixture(path, version);
      assert.equal(
        validateRequirement('fixture.tsx', version, () => source),
        version,
        name,
      );
      assert.throws(() => validateRequirement('fixture.tsx', UNSUPPORTED_VERSION, () => source), {
        code: 'PANEON_VERSION_UNSUPPORTED',
      });
    }
    const current = await readPanelFixture(path);
    assert.equal(
      validateRequirement('fixture.tsx', PACKAGE_VERSION, () => current),
      PACKAGE_VERSION,
    );
  }
});

void test('copied acceptance fixtures resolve versions without changing their source or dependencies', async () => {
  const source = new URL('./fixtures/panels/', import.meta.url);
  const root = await mkdtemp(join(tmpdir(), 'paneon-fixture-versions-'));
  try {
    const panels = (await readdir(source)).filter((name) => name.endsWith('.tsx'));
    const originals = await Promise.all(
      panels.map((name) => readFile(new URL(name, source), 'utf8')),
    );
    for (const version of FIXTURE_VERSIONS) {
      const destination = join(root, version);
      await copyPanelFixtures(source, destination, version);
      for (const name of panels)
        assert.equal(validateRequirement(join(destination, name), version), version, name);
      assert.equal(
        await readFile(join(destination, 'github.ts'), 'utf8'),
        await readFile(new URL('github.ts', source), 'utf8'),
      );
    }
    assert.deepEqual(
      await Promise.all(panels.map((name) => readFile(new URL(name, source), 'utf8'))),
      originals,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
