import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cp, mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPanelFixture } from './panel-fixture.ts';
import { SKILL_ROOT } from './skill-paths.ts';

const { compilePanel } = (await import(
  '../dist/' + 'compiler/index.js'
)) as typeof import('../src/compiler/index.js');
const directory = fileURLToPath(new URL('./browser/', import.meta.url));
const fixtures = (await readdir(directory, { recursive: true }))
  .filter((name) => name.endsWith('-fixture.txt'))
  .sort();
assert.ok(
  fixtures.length > 0,
  'Discover the browser TSX templates, including non-TypeScript filenames.',
);

// Keep three automatically discovered groups in separate test processes.
export function testBrowserFixtures(group: 0 | 1 | 2) {
  for (const [index, name] of fixtures.entries()) {
    if (index % 3 !== group) continue;
    void test(`browser template ${name} compiles through the public panel API`, async () => {
      const root = await mkdtemp(join(tmpdir(), 'paneon-browser-fixture-'));
      try {
        const entry = join(root, name.replace(/\.txt$/, '.tsx'));
        await mkdir(dirname(entry), { recursive: true });
        await cp(join(SKILL_ROOT, 'assets/shared'), join(dirname(entry), 'shared'), {
          recursive: true,
        });
        await writeFile(entry, await readPanelFixture(join(directory, name)));
        const compiled = await compilePanel(entry, join(root, 'build'));
        assert.ok(compiled.manifest.definitionId);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    });
  }
}
