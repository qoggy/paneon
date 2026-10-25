import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const root = await mkdtemp(join(tmpdir(), 'paneon-table-review-pack-'));
const project = new URL('../../', import.meta.url).pathname;
try {
  const packed = await exec(
    'npm',
    ['pack', '--ignore-scripts', '--json', '--pack-destination', root],
    { cwd: project },
  );
  const [metadata] = JSON.parse(packed.stdout);
  const files = new Set(metadata.files.map((entry) => entry.path));
  for (const file of ['dist/ui/index.js', 'dist/ui/index.d.ts'])
    assert.ok(files.has(file), `Missing packaged public UI entry: ${file}`);
  for (const file of [
    'SKILL.md',
    'references/table.md',
    'references/review.md',
    'assets/panels/table/panel.tsx',
    'assets/panels/table/schema.ts',
    'assets/panels/review/panel.tsx',
    'assets/panels/review/schema.ts',
    'assets/shared/markdown-annotation.tsx',
    'assets/shared/markdown-annotation-schema.ts',
    'assets/shared/submission.ts',
  ])
    assert.equal(files.has(`skills/paneon/${file}`), true, `Missing packaged resource: ${file}`);
  const install = join(root, 'installation');
  await exec(
    'npm',
    ['install', '--prefix', install, '--no-audit', '--no-fund', join(root, metadata.filename)],
    { cwd: project, maxBuffer: 4 * 1024 * 1024 },
  );
  const packageRoot = join(install, 'node_modules/@qoggy/paneon');
  assert.equal(
    JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8')).version,
    metadata.version,
  );
  const result = await exec(
    process.execPath,
    [new URL('./table-review.mjs', import.meta.url).pathname],
    {
      cwd: project,
      env: {
        ...process.env,
        PANEON_TEST_RUNTIME_ENTRY: pathToFileURL(join(packageRoot, 'dist/runtime/server.js')).href,
        PANEON_TEST_SKILL_SOURCE: join(packageRoot, 'skills/paneon'),
        PANEON_TEST_CLI_ENTRY: join(packageRoot, 'dist/cli/index.js'),
      },
      maxBuffer: 4 * 1024 * 1024,
    },
  );
  console.log(result.stdout.trim());
  console.log(
    'Independent npm installation: complete table/review resources checked; browser scope follows PANEON_TEST_TABLE_ONLY.',
  );
} finally {
  await rm(root, { recursive: true, force: true });
}
