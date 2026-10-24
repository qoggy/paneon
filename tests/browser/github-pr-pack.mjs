import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, lstat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
const exec = promisify(execFile),
  project = new URL('../../', import.meta.url).pathname,
  root = await mkdtemp(join(tmpdir(), 'paneon-pr-pack-'));
try {
  const packed = await exec(
    'npm',
    ['pack', '--ignore-scripts', '--json', '--pack-destination', root],
    { cwd: project },
  );
  const [metadata] = JSON.parse(packed.stdout),
    files = new Set(metadata.files.map((file) => file.path));
  for (const file of [
    'SKILL.md',
    'references/github-pr.md',
    'assets/examples/github-pr/panel.tsx',
    'assets/examples/github-pr/github.ts',
    'assets/examples/github-pr/model.ts',
    'assets/examples/github-pr/schema.ts',
    'assets/shared/diff.tsx',
    'assets/shared/diff-model.ts',
    'assets/shared/diff-schema.ts',
    'assets/shared/markdown-annotation.tsx',
    'assets/shared/markdown-annotation-mapper.ts',
  ])
    assert.ok(files.has(`skills/paneon/${file}`), `Missing packaged resource: ${file}`);
  const installation = join(root, 'installation');
  await exec(
    'npm',
    ['install', '--prefix', installation, '--no-audit', '--no-fund', join(root, metadata.filename)],
    { cwd: project, maxBuffer: 4 * 1024 * 1024 },
  );
  const packageRoot = join(installation, 'node_modules/paneon');
  assert.equal((await lstat(packageRoot)).isSymbolicLink(), false);
  const digest = createHash('sha256')
    .update(await readFile(join(root, metadata.filename)))
    .digest('hex');
  console.log(`Independent PR npm package SHA-256: ${digest}`);
  const env = {
    ...process.env,
    PANEON_TEST_RUNTIME_ENTRY: pathToFileURL(join(packageRoot, 'dist/runtime/server.js')).href,
    PANEON_TEST_SKILL_SOURCE: join(packageRoot, 'skills/paneon'),
    PANEON_TEST_CLI_ENTRY: join(packageRoot, 'dist/cli/index.js'),
  };
  let failure;
  try {
    const result = await exec(
      process.execPath,
      [new URL('./github-pr.mjs', import.meta.url).pathname],
      { cwd: project, env, maxBuffer: 4 * 1024 * 1024 },
    );
    console.log(result.stdout.trim());
  } catch (error) {
    console.log(error.stdout?.trim());
    console.error(error.stderr?.trim());
    failure = error;
  }
  if (process.env.PANEON_PR_TEST_LIVE === '1') {
    const live = await exec(
      process.execPath,
      [new URL('./github-pr-live.mjs', import.meta.url).pathname],
      { cwd: project, env, maxBuffer: 4 * 1024 * 1024 },
    );
    console.log(live.stdout.trim());
  }
  if (failure)
    throw new Error(
      'Independent installation retains the complete-workflow failure; successful independent cases do not waive that assertion.',
      { cause: failure },
    );
  console.log('Independent installed PR Chrome suite passed.');
} finally {
  await rm(root, { recursive: true, force: true });
}
