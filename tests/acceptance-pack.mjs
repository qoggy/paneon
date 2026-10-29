import { createPackageFixture } from './package-fixture.mjs';
import assert from 'node:assert/strict';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { acceptance, execute, repositoryRoot } from './acceptance-support.mjs';

const scratch = await mkdtemp(join(tmpdir(), 'paneon-package-'));
try {
  const { installation: install, packageRoot } = await createPackageFixture(scratch, {
    build: true,
  });
  for (const directory of ['examples', 'tests'])
    await assert.rejects(access(join(packageRoot, directory)), { code: 'ENOENT' });
  const { stdout } = await execute(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      "import {definePanel,serverAction,z} from '@qoggy/paneon/sdk';import {existsSync} from 'node:fs';import {fileURLToPath} from 'node:url';if(![definePanel,serverAction,z].every(Boolean)||!existsSync(fileURLToPath(import.meta.resolve('@qoggy/paneon/ui'))))process.exit(1);console.log('Package exports resolve.');",
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
