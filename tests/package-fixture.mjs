import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { constants } from 'node:fs';
import { cp, lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { measureTestStep } from './test-timing.ts';

const execute = promisify(execFile);
const repository = fileURLToPath(new URL('../', import.meta.url));

/** Keep only npm's download cache between runs; never reuse an installation or runtime HOME. */
export const packageDownloadCache = () =>
  resolve(process.env.PANEON_TEST_NPM_CACHE || join(homedir(), '.cache', 'paneon-tests', 'npm'));

/** One real installation per release run; every suite gets a private writable clone. */
export async function createPackageFixture(root, { build = false } = {}) {
  const installation = join(root, 'installation');
  let metadata;
  if (process.env.PANEON_TEST_PACKAGE_BASE) {
    const base = process.env.PANEON_TEST_PACKAGE_BASE;
    metadata = JSON.parse(await readFile(join(base, 'metadata.json'), 'utf8'));
    await measureTestStep('package.copy-tarball', () =>
      cp(join(base, metadata.filename), join(root, metadata.filename)),
    );
    await measureTestStep('package.copy-installation', () =>
      cp(join(base, 'installation'), installation, {
        recursive: true,
        verbatimSymlinks: true,
        mode: constants.COPYFILE_FICLONE,
      }),
    );
  } else {
    const env = {
      ...process.env,
      npm_config_cache: packageDownloadCache(),
      npm_config_logs_dir: join(root, 'npm-logs'),
    };
    const packed = await measureTestStep('package.pack', () =>
      execute(
        'npm',
        ['pack', ...(build ? [] : ['--ignore-scripts']), '--json', '--pack-destination', root],
        { cwd: repository, env, timeout: 180_000, maxBuffer: 16 * 1024 * 1024 },
      ),
    );
    [metadata] = JSON.parse(packed.stdout);
    await mkdir(installation);
    await writeFile(join(installation, 'package.json'), '{"private":true,"type":"module"}');
    const { stdout: registry } = await execute('npm', ['config', 'get', 'registry'], {
      cwd: repository,
      env,
    });
    const timeout = Number(process.env.PANEON_TEST_INSTALL_TIMEOUT_MS ?? 600_000);
    assert.ok(Number.isSafeInteger(timeout) && timeout > 0);
    await measureTestStep('package.install', () =>
      execute(
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
        { cwd: installation, env, timeout, maxBuffer: 16 * 1024 * 1024 },
      ),
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
