import { SKILL_PACKAGE_PATH } from '../skill-paths.ts';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { createPackageFixture } from '../package-fixture.mjs';

const root = await mkdtemp(join(tmpdir(), 'paneon-file-review-pack-'));
try {
  const { metadata, packageRoot } = await createPackageFixture(root);
  const files = new Set(metadata.files.map((entry) => entry.path));
  for (const name of ['panel.tsx', 'actions.ts', 'schema.ts', 'feedback.ts', 'model.ts'])
    assert.ok(files.has(`${SKILL_PACKAGE_PATH}/assets/panels/file-review/${name}`));
  for (const name of [
    'references/file-review.md',
    'assets/shared/read-text-file.js',
    'assets/shared/read-text-file.d.ts',
  ])
    assert.ok(files.has(`${SKILL_PACKAGE_PATH}/${name}`));
  assert.equal(files.has(`${SKILL_PACKAGE_PATH}/assets/panels/review/panel.tsx`), false);
  assert.equal(files.has(`${SKILL_PACKAGE_PATH}/references/review.md`), false);
  for (const name of ['file-review', 'markdown-review']) {
    const result = await promisify(execFile)(
      process.execPath,
      [new URL(`./${name}.mjs`, import.meta.url).pathname],
      {
        cwd: root,
        env: {
          ...process.env,
          PANEON_TEST_RUNTIME_ENTRY: pathToFileURL(join(packageRoot, 'dist/runtime/server.js'))
            .href,
          PANEON_TEST_SKILL_SOURCE: join(packageRoot, SKILL_PACKAGE_PATH),
          PANEON_TEST_CLI_ENTRY: join(packageRoot, 'dist/cli/index.js'),
        },
        timeout: 180_000,
        maxBuffer: 4 * 1024 * 1024,
      },
    );
    console.log(result.stdout.trim());
  }
  console.log(
    'Independent npm installation: full File Review Skill, installed SDK/UI, external cwd, cross-file annotations and events passed.',
  );
} finally {
  await rm(root, { recursive: true, force: true });
}
