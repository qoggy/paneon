import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = fileURLToPath(new URL('../', import.meta.url));
const browserScripts = [
  'production-runtime',
  'host-lifecycle',
  'action-input',
  'multiple-tabs',
  'query-lifecycle',
  'source-watching',
  'resource-lifecycle',
  'artifact-retention',
  'management-navigation',
  'panel-status-filter',
  'skill-pages',
  'choose-review-interactions',
  'table-review',
  'table-layout',
  'table-header-themes',
  'feedback',
  'annotation-api',
  'annotation-editor',
  'annotation-popover',
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
  'diff-toolbar',
  'git-review',
  'git-review-chrome',
  'git-review-navigation',
  'git-review-loading',
  'git-review-empty',
  'git-review-layout',
  'git-file-tree',
  'git-file-toolbar',
  'git-file-split',
  'git-select-all',
  'git-mainlines',
  'git-branch-navigation',
  'git-branch-tree',
  'git-history-context-menu',
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
  const metadata=JSON.parse((await execute('npm',['pack','--ignore-scripts','--json','--pack-destination',root])).stdout)[0];
  const installation=join(root,'installation');
  await execute('npm',['install','--prefix',installation,'--no-audit','--no-fund',join(root,metadata.filename)],{timeout:180000,maxBuffer:8*1024*1024});
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
const phases = ['checks', 'unit', 'acceptance', 'browser', 'package', 'live'];
assert.ok(phase === 'all' || phases.includes(phase), `Unknown phase: ${phase}`);
for (const arg of options)
  assert.ok(
    ['--list', '--skip-build', '--coverage'].includes(arg) ||
      arg.startsWith('--phase=') ||
      arg.startsWith('--match='),
    `Unknown option: ${arg}`,
  );
assert.equal(process.versions.node.split('.')[0], '24', 'Use Node.js 24.');
const nodeTestFiles = (await readdir(join(repository, 'tests')))
  .filter((file) => file.endsWith('.test.ts'))
  .sort();
const commands = [
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
      '--test-concurrency=1',
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
assert.ok(commands.length, 'No tests matched.');
if (options.has('--list')) {
  console.log(JSON.stringify({ nodeTestFiles: nodeTestFiles.length, commands }, null, 2));
  process.exit(0);
}

// Preserve generated files that predate this run. Never clean by a broad paneon-* glob.
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
let active;
let interrupted = false;
function stopActive() {
  if (!active?.pid) return;
  try {
    process.kill(process.platform === 'win32' ? active.pid : -active.pid, 'SIGTERM');
  } catch (error) {
    if (error.code !== 'ESRCH') console.error(error);
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
async function run(test) {
  const started = Date.now();
  console.log(`\n[${test.phase}] ${test.name}`);
  const result = await new Promise((done) => {
    active = spawn(test.command, test.args, {
      cwd: repository,
      env,
      stdio: 'inherit',
      detached: process.platform !== 'win32',
    });
    active.once('error', (error) => done({ code: 1, error: error.message }));
    active.once('exit', (code, signal) => done({ code: code ?? 1, signal }));
  });
  active = undefined;
  results.push({
    phase: test.phase,
    name: test.name,
    ...result,
    seconds: Math.round((Date.now() - started) / 1000),
  });
  return result.code === 0;
}
try {
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
    for (const test of commands) {
      if (interrupted) break;
      await run(test);
    }
  }
} finally {
  // Tests own their service shutdown; also stop an isolated CLI daemon if a test left it running.
  if (await exists(join(home, '.paneon/runtime.json')))
    await run({
      phase: 'cleanup',
      name: 'isolated-server-stop',
      command: process.execPath,
      args: ['dist/cli/index.js', 'server', 'stop', '--json'],
    });
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
}
if (interrupted || results.some((result) => result.code !== 0)) process.exitCode = 1;
