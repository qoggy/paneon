import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

// Run npm run build first. Test a real independent npm installation without source symlinks.
const execute = promisify(execFile);
const repository = new URL('../../', import.meta.url).pathname;
const scratch = await mkdtemp(join(tmpdir(), 'paneon-feedback-pack-'));
try {
  const packed = await execute(
    'npm',
    ['pack', '--ignore-scripts', '--json', '--pack-destination', scratch],
    { cwd: repository, maxBuffer: 8 * 1024 * 1024 },
  );
  const metadata = JSON.parse(packed.stdout);
  const installation = join(scratch, 'installation');
  await mkdir(installation);
  await writeFile(
    join(installation, 'package.json'),
    JSON.stringify({ private: true, type: 'module' }),
  );
  const registry = await execute('npm', ['config', 'get', 'registry'], { cwd: repository });
  await execute(
    'npm',
    [
      'install',
      '--omit=dev',
      '--no-audit',
      '--no-fund',
      '--registry',
      registry.stdout.trim(),
      join(scratch, metadata[0].filename),
    ],
    { cwd: installation, timeout: 180000, maxBuffer: 8 * 1024 * 1024 },
  );
  const installed = join(installation, 'node_modules/@qoggy/paneon');
  const exports = await execute(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
    import assert from 'node:assert/strict';
    import {annotationValueSchema,z} from '@qoggy/paneon/sdk';
    import {annotationValueSchema as browser} from '@qoggy/paneon/sdk/client';
    import {existsSync} from 'node:fs';
    import {fileURLToPath} from 'node:url';
    assert.deepEqual(annotationValueSchema(z.string()).parse({annotations:[]}),browser(z.string()).parse({annotations:[]}));
    assert.ok(existsSync(fileURLToPath(import.meta.resolve('@qoggy/paneon/ui'))));
    console.log('Installed public feedback exports resolve.');
  `,
    ],
    { cwd: installation },
  );
  assert.match(exports.stdout, /exports resolve/);
  const result = await execute(process.execPath, [join(repository, 'tests/browser/feedback.mjs')], {
    cwd: repository,
    timeout: 120000,
    maxBuffer: 8 * 1024 * 1024,
    env: {
      ...process.env,
      PANEON_TEST_RUNTIME_ENTRY: join(installed, 'dist/runtime/server.js'),
      PANEON_TEST_CLI_ENTRY: join(installed, 'dist/cli/index.js'),
    },
  });
  console.log(exports.stdout.trim());
  console.log(result.stdout.trim());
} finally {
  await rm(scratch, { recursive: true, force: true });
}
