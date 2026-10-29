import { createPackageFixture } from '../package-fixture.mjs';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const root = await mkdtemp(join(tmpdir(), 'paneon-skill-pack-'));
const project = new URL('../../', import.meta.url).pathname;
try {
  const { metadata, packageRoot } = await createPackageFixture(root);
  const files = new Set(metadata.files.map((entry) => entry.path));
  for (const file of [
    'SKILL.md',
    'references/choose.md',
    'references/form.md',
    'assets/panels/choose/panel.tsx',
    'assets/panels/choose/schema.ts',
    'assets/panels/form/panel.tsx',
    'assets/panels/form/schema.ts',
    'references/diff-review.md',
    'assets/panels/diff-review/panel.tsx',
    'assets/panels/diff-review/schema.ts',
    'assets/panels/diff-review/model.ts',
    'assets/panels/diff-review/icons.tsx',
    'assets/panels/diff-review/icons.LICENSE',
    'assets/shared/submission.ts',
  ])
    assert.equal(files.has(`skills/paneon/${file}`), true, `Missing packaged resource: ${file}`);
  assert.equal(
    JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8')).version,
    metadata.version,
  );
  const failed = [];
  for (const name of [
    'skill-pages',
    'tree',
    'diff-review',
    'markdown-frontmatter',
    'file-references',
    'local-resources',
  ]) {
    console.log(`Installed package browser verification: ${name}`);
    try {
      const result = await exec(
        process.execPath,
        [new URL(`./${name}.mjs`, import.meta.url).pathname],
        {
          cwd: project,
          env: {
            ...process.env,
            PANEON_TEST_RUNTIME_ENTRY: pathToFileURL(join(packageRoot, 'dist/runtime/server.js'))
              .href,
            PANEON_TEST_SKILL_SOURCE: join(packageRoot, 'skills/paneon'),
            PANEON_TEST_CLI_ENTRY: join(packageRoot, 'dist/cli/index.js'),
          },
          timeout: 180_000,
          maxBuffer: 4 * 1024 * 1024,
        },
      );
      console.log(result.stdout.trim());
    } catch (error) {
      failed.push(name);
      console.error(`${name} failed:`, error.stdout || '', error.stderr || error.message);
    }
  }
  assert.deepEqual(failed, [], 'Every installed-package browser verification must pass.');
  console.log(
    'Independent npm installation: complete version-matched skill copy and packaged runtime/CLI passed browser acceptance.',
  );
} finally {
  await rm(root, { recursive: true, force: true });
}
