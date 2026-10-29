import { createPackageFixture } from '../package-fixture.mjs';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { lstat, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
const exec = promisify(execFile);
const root = await mkdtemp(join(tmpdir(), 'paneon-explanations-pack-'));
const project = new URL('../../', import.meta.url).pathname;
try {
  const { metadata, packageRoot: installed } = await createPackageFixture(root);
  const files = new Set(metadata.files.map((file) => file.path));
  for (const file of [
    'references/authoring.md',
    'assets/examples/dining-philosophers/panel.tsx',
    'assets/examples/dining-philosophers/model.ts',
    'assets/examples/sentinel-leap-array/panel.tsx',
    'assets/examples/sentinel-leap-array/model.ts',
  ])
    assert.equal(files.has(`skills/paneon/${file}`), true, `Missing ${file}`);
  assert.equal((await lstat(installed)).isSymbolicLink(), false);
  assert.equal(
    JSON.parse(await readFile(join(installed, 'package.json'), 'utf8')).version,
    metadata.version,
  );
  const result = await exec(
    process.execPath,
    [new URL('./explanations.mjs', import.meta.url).pathname],
    {
      cwd: project,
      env: {
        ...process.env,
        PANEON_TEST_RUNTIME_ENTRY: pathToFileURL(join(installed, 'dist/runtime/server.js')).href,
        PANEON_TEST_SKILL_SOURCE: join(installed, 'skills/paneon'),
        PANEON_TEST_CLI_ENTRY: join(installed, 'dist/cli/index.js'),
      },
      maxBuffer: 4 * 1024 * 1024,
    },
  );
  console.log(result.stdout.trim());
  console.log(
    `Independent npm installation passed; package ${metadata.filename}, shasum ${metadata.shasum}.`,
  );
} finally {
  await rm(root, { recursive: true, force: true });
}
