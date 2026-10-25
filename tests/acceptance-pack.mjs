import assert from 'node:assert/strict';
import { access, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { acceptance, execute, repositoryRoot } from './acceptance-support.mjs';

const installTimeout = Number(process.env.PANEON_TEST_INSTALL_TIMEOUT_MS ?? 600_000);
assert.ok(Number.isSafeInteger(installTimeout) && installTimeout > 0);
const scratch = await mkdtemp(join(tmpdir(), 'paneon-package-'));
// Keep the source checkout's selected registry when npm changes working directory.
const { stdout: registry } = await execute('npm', ['config', 'get', 'registry'], {
  cwd: repositoryRoot,
});
try {
  // prepack builds the real package; no symlink back to the source checkout.
  await execute('npm', ['pack', '--pack-destination', scratch], {
    cwd: repositoryRoot,
    timeout: 180_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  const { version } = JSON.parse(await readFile(join(repositoryRoot, 'package.json'), 'utf8'));
  const tarball = join(scratch, `paneon-${version}.tgz`);
  const install = join(scratch, 'installation');
  await mkdir(install);
  await writeFile(join(install, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  await execute(
    'npm',
    ['install', '--omit=dev', '--no-audit', '--no-fund', '--registry', registry.trim(), tarball],
    {
      cwd: install,
      timeout: installTimeout,
      maxBuffer: 16 * 1024 * 1024,
    },
  );
  const packageRoot = join(install, 'node_modules/paneon');
  for (const directory of ['examples', 'tests'])
    await assert.rejects(access(join(packageRoot, directory)), { code: 'ENOENT' });
  const { stdout } = await execute(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      "import {definePanel,serverAction,z} from 'paneon/sdk';import {existsSync} from 'node:fs';import {fileURLToPath} from 'node:url';if(![definePanel,serverAction,z].every(Boolean)||!existsSync(fileURLToPath(import.meta.resolve('paneon/ui'))))process.exit(1);console.log('Package exports resolve.');",
    ],
    { cwd: install },
  );
  assert.match(stdout, /Package exports resolve/);
  await acceptance({
    cliPath: join(packageRoot, 'dist/cli/index.js'),
    fixturesPath: join(repositoryRoot, 'tests/fixtures/panels'),
    label: 'installed-package',
  });
} finally {
  await rm(scratch, { recursive: true, force: true });
}
