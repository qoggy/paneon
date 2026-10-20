import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const packageJson = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as { version: string };

const entries = {
  source: new URL('../src/cli/index.ts', import.meta.url),
  built: new URL('../dist/cli/index.js', import.meta.url),
};

for (const [name, entry] of Object.entries(entries)) {
  const run = (...args: string[]) => {
    const result = spawnSync(process.execPath, [fileURLToPath(entry), ...args], {
      cwd: tmpdir(),
      encoding: 'utf8',
      timeout: 5_000,
    });

    assert.ifError(result.error);
    assert.equal(result.signal, null);
    return result;
  };

  void test(`${name}: --help lists supported options and exits successfully`, () => {
    const result = run('--help');

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Usage: paneon/);
    assert.match(result.stdout, /--help/);
    assert.match(result.stdout, /--version/);
    assert.equal(result.stderr, '');
  });

  void test(`${name}: --version matches the package version from another directory`, () => {
    const result = run('--version');

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), packageJson.version);
    assert.equal(result.stderr, '');
  });

  void test(`${name}: unsupported options report an error and exit unsuccessfully`, () => {
    const result = run('--not-a-paneon-option');

    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /unknown option '--not-a-paneon-option'/);
  });
}
