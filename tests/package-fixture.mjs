import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { constants } from 'node:fs';
import { cp, lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const repository = fileURLToPath(new URL('../', import.meta.url));

/** One real installation per release run; every suite gets a private writable clone. */
export async function createPackageFixture(root, { build = false } = {}) {
  const installation = join(root, 'installation');
  let metadata;
  if (process.env.PANEON_TEST_PACKAGE_BASE) {
    const base = process.env.PANEON_TEST_PACKAGE_BASE;
    metadata = JSON.parse(await readFile(join(base, 'metadata.json'), 'utf8'));
    await cp(join(base, metadata.filename), join(root, metadata.filename));
    await cp(join(base, 'installation'), installation, {
      recursive: true,
      verbatimSymlinks: true,
      mode: constants.COPYFILE_FICLONE,
    });
  } else {
    const packed = await execute(
      'npm',
      ['pack', ...(build ? [] : ['--ignore-scripts']), '--json', '--pack-destination', root],
      { cwd: repository, timeout: 180_000, maxBuffer: 16 * 1024 * 1024 },
    );
    [metadata] = JSON.parse(packed.stdout);
    await mkdir(installation);
    await writeFile(join(installation, 'package.json'), '{"private":true,"type":"module"}');
    const { stdout: registry } = await execute('npm', ['config', 'get', 'registry'], {
      cwd: repository,
    });
    const timeout = Number(process.env.PANEON_TEST_INSTALL_TIMEOUT_MS ?? 600_000);
    assert.ok(Number.isSafeInteger(timeout) && timeout > 0);
    await execute(
      'npm',
      [
        'install',
        '--omit=dev',
        '--no-audit',
        '--no-fund',
        '--registry',
        registry.trim(),
        join(root, metadata.filename),
      ],
      { cwd: installation, timeout, maxBuffer: 16 * 1024 * 1024 },
    );
    await writeFile(join(root, 'metadata.json'), JSON.stringify(metadata));
  }
  const packageRoot = join(installation, 'node_modules/@qoggy/paneon');
  assert.equal((await lstat(packageRoot)).isSymbolicLink(), false);
  assert.equal(
    JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8')).version,
    metadata.version,
  );
  return { metadata, installation, packageRoot, tarball: join(root, metadata.filename) };
}

if (import.meta.main) {
  assert.ok(process.argv[2], 'Provide a temporary package baseline directory.');
  await mkdir(process.argv[2], { recursive: true });
  await createPackageFixture(process.argv[2]);
  console.log('Packed once and installed one independent npm baseline for this release run.');
}
