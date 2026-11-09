import assert from 'node:assert/strict';
import { test } from 'node:test';
import { releasePlan } from '../.github/scripts/npm-publish.ts';

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
