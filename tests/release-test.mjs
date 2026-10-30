import { deduplicateJobs, runJobs } from './release-support.ts';
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import {
  cp,
  lstat,
  mkdir,
  open,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const repository = fileURLToPath(new URL('../', import.meta.url));
const browserScripts = [
  'production-runtime',
  'host-lifecycle',
  'build-diagnostics',
  'action-input',
  'multiple-tabs',
  'query-lifecycle',
  'source-watching',
  'resource-lifecycle',
  'artifact-retention',
  'management-navigation',
  'panel-status-filter',
  'panel-deletion',
  'skill-pages',
  'choose-review-interactions',
  'table-review',
  'table-layout',
  'table-header-themes',
  'feedback',
  'annotation-api',
  'annotation-editor',
  'annotation-popover',
  'annotation-drag',
  'annotation-submission-toast',
  'promoted-ui',
  'ui',
  'imported-tailwind',
  'preferences',
  'preferences-transition',
  'preferences-standard-pages',
  'preferences-git',
  'mermaid',
  'mermaid-viewer',
  'explanations',
  'dining-philosophers',
  'sentinel-leap-array',
  'diff-boundaries',
  'diff-reading',
  'diff-resize',
  'diff-connected',
  'diff-layout',
  'diff-scrollbars',
  'diff-annotations',
  'diff-highlighting',
  'markdown-highlighting',
  'code-block',
  'markdown-anchors',
  'markdown-images',
  'file-references',
  'local-resources',
  'markdown-frontmatter',
  'diff-toolbar',
  'git-review',
  'git-review-refresh',
  'git-review-repositories',
  'git-review-input',
  'git-review-checkout',
  'git-review-chrome',
  'git-review-navigation',
  'git-review-loading',
  'git-review-empty',
  'git-review-layout',
  'git-history-resizable',
  'git-file-tree',
  'tree',
  'diff-review',
  'git-file-toolbar',
  'git-file-split',
  'git-select-all',
  'git-mainlines',
  'git-branch-navigation',
  'git-branch-tree',
  'git-history-context-menu',
  'git-history-view-changes',
  'git-compare-revisions',
  'git-shadcn-controls',
  'github-pr',
  'github-pr-layout',
];
const packageScripts = [
  'acceptance-pack.mjs',
  'preferences-pack.mjs',
  'browser/skill-pages-pack.mjs',
  'browser/table-review-pack.mjs',
  'browser/code-block-pack.mjs',
  'browser/feedback-pack.mjs',
  'browser/git-review-pack.mjs',
  'browser/github-pr-pack.mjs',
  'browser/explanations-pack.mjs',
];
const packageBinProbe = `
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const execute=promisify(execFile), root=await mkdtemp(join(tmpdir(),'paneon-bin-'));
try {
  const {createPackageFixture}=await import(${JSON.stringify(new URL('./package-fixture.mjs', import.meta.url).href)});
  const {installation}=await createPackageFixture(root);
  const binary=join(installation,'node_modules/.bin/paneon');
  const version=JSON.parse(await readFile('package.json','utf8')).version;
  assert.equal((await execute(binary,['--version'])).stdout.trim(),version);
  assert.match((await execute(binary,['--help'])).stdout,/Usage: paneon/);
  const status=JSON.parse((await execute(binary,['server','status','--json'])).stdout);
  assert.deepEqual(status.data,{running:false,runtime:null});
  console.log('Installed npm bin executes directly: shebang, version, help and no-start status passed.');
} finally { await rm(root,{recursive:true,force:true}); }
`;
const options = new Set(process.argv.slice(2));
const phase = [...options].find((arg) => arg.startsWith('--phase='))?.slice(8) ?? 'all';
const match = [...options].find((arg) => arg.startsWith('--match='))?.slice(8) ?? '';
const patterns = match.split(',').filter(Boolean);
const jobs = Number([...options].find((arg) => arg.startsWith('--jobs='))?.slice(7) ?? 2);
assert.ok(
  Number.isSafeInteger(jobs) && jobs >= 1 && jobs <= 6,
  '--jobs must be an integer from 1 to 6.',
);
const phases = ['checks', 'unit', 'acceptance', 'browser', 'package', 'live'];
assert.ok(phase === 'all' || phases.includes(phase), `Unknown phase: ${phase}`);
for (const arg of options)
  assert.ok(
    ['--list', '--skip-build', '--coverage'].includes(arg) ||
      arg.startsWith('--phase=') ||
      arg.startsWith('--match=') ||
      arg.startsWith('--jobs='),
    `Unknown option: ${arg}`,
  );
assert.equal(process.versions.node.split('.')[0], '24', 'Use Node.js 24.');
const nodeTestFiles = (await readdir(join(repository, 'tests')))
  .filter((file) => file.endsWith('.test.ts'))
  .sort();
const selectedCommands = [
  ...['lint', 'format:check'].map((name) => ({
    phase: 'checks',
    name,
    command: 'npm',
    args: ['run', name],
  })),
  {
    phase: 'unit',
    name: 'node-tests',
    command: process.execPath,
    args: [
      '--test',
      // Keep in sync with the npm test script; test files isolate HOME, ports and temp roots.
      '--test-concurrency=6',
      ...(options.has('--coverage')
        ? [
            '--experimental-test-coverage',
            '--test-coverage-include=src/**/*.ts',
            '--test-coverage-include=dist/**/*.js',
            '--test-coverage-exclude=dist/ui/**',
            '--test-coverage-exclude=dist/web/**',
          ]
        : []),
      ...nodeTestFiles.map((file) => `tests/${file}`),
    ],
  },
  ...['init-interactive.mjs', 'acceptance.mjs', 'acceptance-versions.mjs'].map((file) => ({
    phase: 'acceptance',
    name: file,
    command: process.execPath,
    args: [`tests/${file}`],
  })),
  ...browserScripts.map((name) => ({
    phase: 'browser',
    name,
    covers: name === 'git-review' ? ['git-review-layout'] : [],
    command: process.execPath,
    args: [`tests/browser/${name}.mjs`],
  })),
  ...packageScripts.map((file) => ({
    phase: 'package',
    name: file,
    command: process.execPath,
    args: [`tests/${file}`],
  })),
  {
    phase: 'package',
    name: 'package-cli-bin',
    command: process.execPath,
    args: ['--input-type=module', '-e', packageBinProbe],
  },
  ...['github-pr-live.mjs', 'browser/github-pr-live.mjs'].map((file) => ({
    phase: 'live',
    name: file,
    command: process.execPath,
    args: [`tests/${file}`],
  })),
].filter(
  (test) =>
    (phase === 'all' ? test.phase !== 'live' : test.phase === phase) &&
    (!patterns.length || patterns.some((pattern) => test.name.includes(pattern))),
);
const commands = deduplicateJobs(selectedCommands);
assert.ok(commands.length, 'No tests matched.');
if (options.has('--list')) {
  console.log(
    JSON.stringify(
      {
        nodeTestFiles: nodeTestFiles.length,
        jobs,
        covered: selectedCommands
          .filter((test) => !commands.includes(test))
          .map((test) => test.name),
        commands,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

// Preserve generated files that predate this run. Never clean by a broad paneon-* glob.
const runStarted = Date.now();
const scratch = await realpath(await mkdtemp(join(tmpdir(), 'paneon-release-')));
console.log(`Release test PID: ${process.pid}; temporary directory: ${scratch}`);
const temporary = join(scratch, 'tmp');
const home = join(scratch, 'home');
const artifacts = join(scratch, 'artifacts');
await Promise.all([temporary, home, artifacts].map((path) => mkdir(path)));
const env = {
  ...process.env,
  HOME: home,
  USERPROFILE: home,
  TMPDIR: temporary,
  TMP: temporary,
  TEMP: temporary,
  XDG_CONFIG_HOME: join(home, '.config'),
  CLAUDE_CONFIG_DIR: join(home, '.claude'),
  PANEON_TEST_ARTIFACTS: artifacts,
  PANEON_TEST_SCREENSHOTS: artifacts,
  PANEON_TEST_DESKTOP_ONLY: '1',
  PANEON_PR_TEST_LIVE: '0',
  npm_config_cache: join(scratch, 'npm-cache'),
  npm_config_userconfig: process.env.npm_config_userconfig ?? join(process.env.HOME, '.npmrc'),
};
delete env.PANEON_HOME;
delete env.CODEX_HOME;
for (const key of [
  'PANEON_TEST_RUNTIME_ENTRY',
  'PANEON_TEST_SKILL_SOURCE',
  'PANEON_TEST_CLI_ENTRY',
  'PANEON_TEST_TABLE_ONLY',
  'PANEON_TEST_INPLACE_SKILL',
  'PANEON_INIT_PACKAGE_ROOT',
  'PANEON_TEST_PACKAGE_BASE',
])
  delete env[key];
if (phase === 'live')
  env.GH_CONFIG_DIR = process.env.GH_CONFIG_DIR ?? join(process.env.HOME, '.config/gh');
// Keep browser discovery outside the isolated HOME; do not install a browser implicitly.
env.PLAYWRIGHT_BROWSERS_PATH =
  process.env.PLAYWRIGHT_BROWSERS_PATH ??
  (process.platform === 'darwin'
    ? join(process.env.HOME, 'Library/Caches/ms-playwright')
    : join(process.env.HOME, '.cache/ms-playwright'));
if (process.platform === 'darwin' && !env.PANEON_TEST_BROWSER)
  env.PANEON_TEST_BROWSER = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const results = [];
const backups = [];
const directorySnapshots = [];
const active = new Set();
const jobHomes = [];
let interrupted = false;
function stopActive() {
  for (const child of active) {
    if (!child.pid) continue;
    try {
      process.kill(process.platform === 'win32' ? child.pid : -child.pid, 'SIGTERM');
    } catch (error) {
      if (error.code !== 'ESRCH') console.error(error);
    }
  }
}
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    interrupted = true;
    stopActive();
  });
async function exists(path) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}
async function preserve(path) {
  const backup = join(scratch, `backup-${backups.length}`);
  const existed = await exists(path);
  if (existed) await cp(path, backup, { recursive: true, verbatimSymlinks: true });
  backups.push({ path, backup, existed });
}
// Follow local fixture imports and child script literals to protect transitive clipboard
// use and legacy absolute screenshot paths, including installed-package wrappers.
async function resourcesFor(entry, seen = new Set()) {
  if (seen.has(entry) || !entry.startsWith(join(repository, 'tests') + '/')) return [];
  seen.add(entry);
  if (!(await exists(entry))) return [];
  const source = await readFile(entry, 'utf8');
  const resources = new Set(source.includes('clipboard') ? ['clipboard'] : []);
  // This wrapper constructs child filenames dynamically, including local-resources.mjs.
  if (entry === join(repository, 'tests/browser/skill-pages-pack.mjs')) resources.add('clipboard');
  if (entry === join(repository, 'tests/browser/ui.mjs')) resources.add('repository-vite');
  for (const hit of source.matchAll(/['"]((?:\/private)?\/tmp\/paneon-[^'"\n]+)['"]/g))
    resources.add(
      'legacy:' +
        hit[1]
          .replace(/^\/private/, '')
          .split('/')
          .slice(0, 3)
          .join('/'),
    );
  for (const hit of source.matchAll(/['"]([^'"\n]+\.(?:mjs|ts))['"]/g)) {
    const relative = hit[1];
    const candidates = [resolve(dirname(entry), relative), resolve(repository, relative)];
    for (const candidate of candidates)
      for (const resource of await resourcesFor(candidate, seen)) resources.add(resource);
  }
  return [...resources];
}
async function isolatedEnvironment() {
  const root = await mkdtemp(join(temporary, 'job-'));
  const home = join(root, 'home');
  const temp = join(root, 'tmp');
  const artifacts = join(root, 'artifacts');
  await Promise.all([home, temp, artifacts].map((path) => mkdir(path)));
  jobHomes.push(home);
  return {
    ...env,
    HOME: home,
    USERPROFILE: home,
    TMPDIR: temp,
    TMP: temp,
    TEMP: temp,
    XDG_CONFIG_HOME: join(home, '.config'),
    CLAUDE_CONFIG_DIR: join(home, '.claude'),
    PANEON_TEST_ARTIFACTS: artifacts,
    PANEON_TEST_SCREENSHOTS: artifacts,
  };
}
async function run(test, environment = env) {
  const started = Date.now();
  console.log(`\n[${test.phase}] ${test.name}`);
  const log = join(
    artifacts,
    `command-${results.length}-${Date.now()}-${test.name.replace(/[^a-zA-Z0-9-]/g, '-')}.log`,
  );
  const output = await open(log, 'w');
  let result;
  try {
    result = await new Promise((done) => {
      const child = spawn(test.command, test.args, {
        cwd: repository,
        env: environment,
        stdio: ['ignore', output.fd, output.fd],
        detached: process.platform !== 'win32',
      });
      active.add(child);
      child.once('error', (error) => {
        active.delete(child);
        done({ code: 1, error: error.message });
      });
      child.once('exit', (code, signal) => {
        active.delete(child);
        done({ code: code ?? 1, signal });
      });
    });
  } finally {
    await output.close();
  }
  const seconds = Math.round((Date.now() - started) / 1000);
  console.log(
    `[${result.code === 0 ? 'PASS' : 'FAIL'} ${test.phase}] ${test.name} (${seconds}s)\n${await readFile(log, 'utf8')}`,
  );
  results.push({ phase: test.phase, name: test.name, ...result, seconds });
  return result.code === 0;
}

try {
  if (phase === 'live' && !env.GH_TOKEN && !env.GITHUB_TOKEN) {
    // HOME isolation can hide gh's credential store even when GH_CONFIG_DIR is retained.
    // Read the existing login before spawning isolated tests; never print or persist it.
    const { stdout } = await promisify(execFile)(
      'gh',
      ['auth', 'token', '--hostname', process.env.GH_HOST ?? 'github.com'],
      { cwd: repository, env: process.env, timeout: 30_000 },
    );
    assert.ok(stdout.trim(), 'The existing GitHub login did not provide a token.');
    env.GH_TOKEN = stdout.trim();
  }
  await preserve(join(repository, 'dist'));
  for (const path of ['tmp', 'node_modules/.vite', 'node_modules/.vite-temp', 'tests']) {
    const absolute = join(repository, path);
    directorySnapshots.push({
      path: absolute,
      existed: await exists(absolute),
      entries: new Set(
        await readdir(absolute).catch((error) => {
          if (error.code === 'ENOENT') return [];
          throw error;
        }),
      ),
    });
  }
  // Legacy scripts still use literal screenshot paths. Save and restore those exact paths.
  const literalPaths = new Set();
  const systemTemporary = await realpath('/tmp');
  for (const file of await readdir(join(repository, 'tests/browser'))) {
    if (!file.endsWith('.mjs')) continue;
    const source = await readFile(join(repository, 'tests/browser', file), 'utf8');
    for (const hit of source.matchAll(/['"]((?:\/private)?\/tmp\/paneon-[^'"\n]+)['"]/g))
      literalPaths.add(resolve(hit[1].replace(/^(?:\/private)?\/tmp\//, `${systemTemporary}/`)));
  }
  for (const path of [...literalPaths].filter(
    (path, _, all) => !all.some((parent) => path.startsWith(`${parent}/`)),
  ))
    await preserve(path);
  const built =
    options.has('--skip-build') ||
    (await run({ phase: 'build', name: 'build', command: 'npm', args: ['run', 'build'] }));
  if (built) {
    await lstat(join(repository, 'dist/cli/index.js'));
    let ready = true;
    if (commands.some((test) => ['browser', 'package', 'live'].includes(test.phase))) {
      ready = await run({
        phase: 'prepare',
        name: 'bundled-version-preflight',
        command: process.execPath,
        args: [
          '--input-type=module',
          '-e',
          `
          import {validateRequirement} from './dist/compiler/index.js';
          import {PACKAGE_VERSION} from './dist/shared/paths.js';
          for (const path of ${JSON.stringify([
            ...['choose', 'form', 'table', 'review', 'git-review', 'diff-review'].map(
              (name) => `skills/paneon/assets/panels/${name}/panel.tsx`,
            ),
            ...['github-pr', 'dining-philosophers', 'sentinel-leap-array'].map(
              (name) => `skills/paneon/assets/examples/${name}/panel.tsx`,
            ),
          ])}) validateRequirement(path, PACKAGE_VERSION);
          console.log('Bundled panels and examples accept package version ' + PACKAGE_VERSION);
        `,
        ],
      });
    }
    if (ready)
      for (const currentPhase of phases) {
        if (interrupted) break;
        const group = commands.filter((test) => test.phase === currentPhase);
        if (!group.length) continue;
        if (currentPhase === 'package') {
          const base = join(scratch, 'package-base');
          if (
            !(await run({
              phase: 'prepare',
              name: 'package-baseline',
              command: process.execPath,
              args: ['tests/package-fixture.mjs', base],
            }))
          )
            break;
          env.PANEON_TEST_PACKAGE_BASE = base;
        }
        for (const test of group) {
          const entry = test.args.find((arg) => /^tests\/.*\.mjs$/.test(arg));
          test.resources = entry ? await resourcesFor(resolve(repository, entry)) : [];
        }
        await runJobs(
          group,
          ['browser', 'package'].includes(currentPhase) ? jobs : 1,
          async (test) => {
            await run(test, await isolatedEnvironment());
          },
          () => interrupted,
        );
      }
  }
} finally {
  // Tests own their service shutdown; also stop an isolated CLI daemon if a test left it running.
  for (const isolatedHome of [home, ...jobHomes]) {
    if (await exists(join(isolatedHome, '.paneon/runtime.json')))
      await run(
        {
          phase: 'cleanup',
          name: 'isolated-server-stop',
          command: process.execPath,
          args: ['dist/cli/index.js', 'server', 'stop', '--json'],
        },
        { ...env, HOME: isolatedHome },
      );
  }
  for (const snapshot of directorySnapshots) {
    for (const entry of await readdir(snapshot.path).catch((error) => {
      if (error.code === 'ENOENT') return [];
      throw error;
    })) {
      if (snapshot.entries.has(entry)) continue;
      // Only generated entries are removed from tests/, never newly authored test cases.
      if (snapshot.path === join(repository, 'tests') && !entry.startsWith('.mermaid-test-'))
        continue;
      await rm(join(snapshot.path, entry), { recursive: true, force: true });
    }
    if (!snapshot.existed) await rm(snapshot.path, { recursive: true, force: true });
  }
  for (const { path, backup, existed } of backups.reverse()) {
    await rm(path, { recursive: true, force: true });
    if (existed) await cp(backup, path, { recursive: true, verbatimSymlinks: true });
  }
  await writeFile(join(artifacts, 'results.json'), JSON.stringify(results, null, 2));
  console.log(`\nRelease test results:\n${JSON.stringify(results, null, 2)}`);
  await rm(scratch, { recursive: true, force: true });
  console.log(
    'Temporary HOME, fixtures, screenshots and reports removed; previous dist and fixed screenshot paths restored.',
  );
  console.log(`Release test wall time: ${Math.round((Date.now() - runStarted) / 1000)}s.`);
}
if (interrupted || results.some((result) => result.code !== 0)) process.exitCode = 1;
