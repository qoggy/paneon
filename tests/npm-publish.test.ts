import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { releasePlan, waitForPublishedIntegrity } from '../.github/scripts/npm-publish.ts';

function plan(tag: string, versions: string[]) {
  const version = tag.slice(1);
  return releasePlan(
    tag,
    { name: '@qoggy/paneon', version },
    {
      version,
      packages: { '': { version } },
    },
    versions,
  );
}

void test('new highest stable versions use latest, ignoring newer prereleases', () => {
  assert.deepEqual(plan('v0.5.1', ['0.5.0', '0.6.0-beta.1']), {
    version: '0.5.1',
    distTag: 'latest',
  });
});

void test('beta versions use beta and never move latest', () => {
  assert.deepEqual(plan('v0.6.0-beta.1', ['0.5.0']), { version: '0.6.0-beta.1', distTag: 'beta' });
});

void test('older stable version lines use their maintenance dist-tag', () => {
  assert.deepEqual(plan('v0.4.2', ['0.5.0', '0.4.1']), { version: '0.4.2', distTag: 'latest-0.4' });
});

void test('published versions are rejected before packing or publishing', () => {
  assert.throws(() => plan('v0.5.0', ['0.5.0']), /already published/);
});

void test('release tags accept only canonical stable and numbered beta versions', () => {
  for (const tag of ['0.5.1', 'v0.5', 'v01.5.1', 'v0.5.1-beta.0', 'v0.5.1-rc.1', 'v0.5.1+build'])
    assert.throws(() => plan(tag, ['0.5.0']));
});

void test('the tag, package version and both lockfile versions must agree', () => {
  for (const versions of [
    ['0.5.0', '0.5.1', '0.5.1'],
    ['0.5.1', '0.5.0', '0.5.1'],
    ['0.5.1', '0.5.1', '0.5.0'],
  ]) {
    assert.throws(
      () =>
        releasePlan(
          'v0.5.1',
          { name: '@qoggy/paneon', version: versions[0] },
          {
            version: versions[1],
            packages: { '': { version: versions[2] } },
          },
          ['0.5.0'],
        ),
      /must match/,
    );
  }
});

const npmFailure = (code: string) =>
  Object.assign(new Error('npm command failed'), { stdout: JSON.stringify({ error: { code } }) });

void test('verification waits for npm processing to expose the new version', async (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'] });
  let calls = 0;
  const result = waitForPublishedIntegrity(() => {
    if (++calls < 3) throw npmFailure('E404');
    return 'sha512-published';
  });
  assert.equal(calls, 1);
  t.mock.timers.tick(10_000);
  await Promise.resolve();
  assert.equal(calls, 2);
  t.mock.timers.tick(10_000);
  assert.equal(await result, 'sha512-published');
  assert.equal(calls, 3);
});

void test('verification times out on a version that never becomes visible and retains the cause', async (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'] });
  const pending = npmFailure('E404');
  const result = assert.rejects(
    waitForPublishedIntegrity(() => {
      throw pending;
    }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /did not become visible within 10 minutes/);
      assert.equal(error.cause, pending);
      return true;
    },
  );
  t.mock.timers.tick(10 * 60 * 1000);
  await result;
});

void test('verification propagates auth, network and unstructured failures without polling', async () => {
  for (const error of [
    npmFailure('E401'),
    npmFailure('E403'),
    npmFailure('ETIMEDOUT'),
    new Error('E404 in a message is not a structured npm error'),
    Object.assign(new Error('non-JSON output'), { stdout: 'not JSON' }),
  ]) {
    let calls = 0;
    await assert.rejects(
      waitForPublishedIntegrity(() => {
        calls++;
        throw error;
      }),
      (actual) => actual === error,
    );
    assert.equal(calls, 1);
  }
});

void test('the verify command still rejects wrong integrity or dist-tag and writes a summary only on success', async () => {
  const root = await mkdtemp(join(tmpdir(), 'paneon-npm-verify-'));
  const bin = join(root, 'bin');
  const summary = join(root, 'summary.md');
  const script = new URL('../.github/scripts/npm-publish.ts', import.meta.url).pathname;
  try {
    await mkdir(bin);
    await writeFile(
      join(root, 'package.json'),
      JSON.stringify({ name: '@qoggy/paneon', version: '0.5.1-beta.1' }),
    );
    await writeFile(
      join(bin, 'npm'),
      `#!${process.execPath}
const value=process.argv.includes('dist.integrity')
  ? process.env.TEST_INTEGRITY
  : {beta:process.env.TEST_BETA};
console.log(JSON.stringify(value));`,
      { mode: 0o755 },
    );
    const verify = (integrity: string, beta: string) =>
      promisify(execFile)(process.execPath, [script, 'verify'], {
        cwd: root,
        env: {
          ...process.env,
          PATH: bin + delimiter + process.env.PATH,
          NPM_INTEGRITY: 'sha512-expected',
          DIST_TAG: 'beta',
          GITHUB_STEP_SUMMARY: summary,
          TEST_INTEGRITY: integrity,
          TEST_BETA: beta,
        },
      });
    await assert.rejects(verify('sha512-wrong', '0.5.1-beta.1'), /Published integrity differs/);
    await assert.rejects(readFile(summary), { code: 'ENOENT' });
    await assert.rejects(verify('sha512-expected', '0.5.0'), /Published npm dist-tag differs/);
    await assert.rejects(readFile(summary), { code: 'ENOENT' });
    await verify('sha512-expected', '0.5.1-beta.1');
    assert.match(await readFile(summary, 'utf8'), /npm dist-tag: `beta`/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
