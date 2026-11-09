import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import semver from 'semver';

type Package = { name: string; version: string };
type Lockfile = { version: string; packages: Record<string, { version: string }> };

export function releasePlan(tag: string, pkg: Package, lock: Lockfile, versions: string[]) {
  assert.match(tag, /^v\d+\.\d+\.\d+(?:-beta\.[1-9]\d*)?$/, 'Use vX.Y.Z or vX.Y.Z-beta.N');
  const version = tag.slice(1);
  assert.equal(semver.valid(version), version, 'The tag must contain a canonical semver version');
  assert.equal(pkg.name, '@qoggy/paneon', 'Unexpected npm package name');
  assert.equal(pkg.version, version, 'The tag and package.json version must match');
  assert.equal(lock.version, version, 'The tag and package-lock.json version must match');
  assert.equal(lock.packages[''].version, version, 'The lockfile root package version must match');
  assert.ok(!versions.includes(version), `Version ${version} is already published`);
  const latest = versions
    .filter((value) => semver.valid(value) && !semver.prerelease(value))
    .sort(semver.rcompare)[0];
  const distTag = semver.prerelease(version)
    ? 'beta'
    : latest && semver.lt(version, latest)
      ? `latest-${semver.major(version)}.${semver.minor(version)}`
      : 'latest';
  return { version, distTag };
}

const registry = 'https://registry.npmjs.org/';
const readPackage = () => JSON.parse(readFileSync('package.json', 'utf8')) as Package;
const npmJson = (args: string[]) =>
  JSON.parse(
    execFileSync('npm', [...args, '--json', `--registry=${registry}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'inherit'],
    }),
  ) as unknown;

function outputs(values: Record<string, string>) {
  assert.ok(process.env.GITHUB_OUTPUT, 'GITHUB_OUTPUT is required');
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    Object.entries(values)
      .map(([key, value]) => `${key}=${value}\n`)
      .join(''),
  );
  console.log(values);
}

function main() {
  const pkg = readPackage();
  switch (process.argv[2]) {
    case 'prepare': {
      const lock = JSON.parse(readFileSync('package-lock.json', 'utf8')) as Lockfile;
      const versions = npmJson(['view', pkg.name, 'versions', '--prefer-online']) as string[];
      const plan = releasePlan(process.env.RELEASE_TAG ?? '', pkg, lock, versions);
      outputs({ version: plan.version, dist_tag: plan.distTag });
      break;
    }
    case 'pack': {
      assert.ok(process.env.RUNNER_TEMP, 'RUNNER_TEMP is required');
      const [packed] = npmJson([
        'pack',
        '--ignore-scripts',
        '--pack-destination',
        process.env.RUNNER_TEMP,
      ]) as {
        name: string;
        version: string;
        filename: string;
        integrity: string;
      }[];
      assert.equal(packed.name, pkg.name, 'Packed package name differs from package.json');
      assert.equal(packed.version, pkg.version, 'Packed version differs from package.json');
      outputs({
        tarball: join(process.env.RUNNER_TEMP, packed.filename),
        integrity: packed.integrity,
      });
      break;
    }
    case 'verify': {
      assert.ok(process.env.NPM_INTEGRITY, 'NPM_INTEGRITY is required');
      assert.ok(process.env.DIST_TAG, 'DIST_TAG is required');
      const integrity = npmJson([
        'view',
        `${pkg.name}@${pkg.version}`,
        'dist.integrity',
        '--prefer-online',
      ]);
      const tags = npmJson(['view', pkg.name, 'dist-tags', '--prefer-online']) as Record<
        string,
        string
      >;
      assert.equal(
        integrity,
        process.env.NPM_INTEGRITY,
        'Published integrity differs from the packed artifact',
      );
      assert.equal(
        tags[process.env.DIST_TAG],
        pkg.version,
        'Published npm dist-tag differs from the requested version',
      );
      assert.ok(process.env.GITHUB_STEP_SUMMARY, 'GITHUB_STEP_SUMMARY is required');
      appendFileSync(
        process.env.GITHUB_STEP_SUMMARY,
        `Published [${pkg.name}@${pkg.version}](https://www.npmjs.com/package/${pkg.name}/v/${pkg.version})\n\n` +
          `- npm dist-tag: \`${process.env.DIST_TAG}\`\n` +
          `- Integrity: \`${integrity}\`\n`,
      );
      break;
    }
    default:
      throw new Error('Usage: npm-publish.ts prepare|pack|verify');
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
