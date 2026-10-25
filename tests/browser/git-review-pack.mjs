import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
const exec = promisify(execFile),
  project = new URL('../../', import.meta.url).pathname;
const root = await mkdtemp(join(tmpdir(), 'paneon-git-pack-'));
try {
  const packed = await exec(
    'npm',
    ['pack', '--ignore-scripts', '--json', '--pack-destination', root],
    { cwd: project },
  );
  const [metadata] = JSON.parse(packed.stdout),
    files = new Set(metadata.files.map((f) => f.path));
  for (const file of [
    'SKILL.md',
    'references/git-review.md',
    'assets/panels/git-review/panel.tsx',
    'assets/panels/git-review/schema.ts',
    'assets/panels/git-review/git.ts',
    'assets/shared/diff.tsx',
    'assets/shared/diff-model.ts',
    'assets/shared/diff-schema.ts',
    'assets/shared/submission.ts',
  ])
    assert.ok(files.has(`skills/paneon/${file}`), `Missing packaged resource: ${file}`);
  const installation = join(root, 'installation');
  await exec(
    'npm',
    ['install', '--prefix', installation, '--no-audit', '--no-fund', join(root, metadata.filename)],
    { cwd: project, maxBuffer: 4 * 1024 * 1024 },
  );
  const packageRoot = join(installation, 'node_modules/@qoggy/paneon');
  for (const script of ['git-review.mjs', 'git-review-loading.mjs']) {
    const result = await exec(
      process.execPath,
      [new URL(`./${script}`, import.meta.url).pathname],
      {
        cwd: project,
        env: {
          ...process.env,
          PANEON_TEST_RUNTIME_ENTRY: pathToFileURL(join(packageRoot, 'dist/runtime/server.js'))
            .href,
          PANEON_TEST_SKILL_SOURCE: join(packageRoot, 'skills/paneon'),
          PANEON_TEST_CLI_ENTRY: join(packageRoot, 'dist/cli/index.js'),
        },
        maxBuffer: 4 * 1024 * 1024,
      },
    );
    console.log(result.stdout.trim());
  }
  const digest = createHash('sha256')
    .update(await readFile(join(root, metadata.filename)))
    .digest('hex');
  console.log(`Independent npm installation Git Chrome passed. Package SHA-256: ${digest}`);
} finally {
  await rm(root, { recursive: true, force: true });
}
