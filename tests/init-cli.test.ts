import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const entries = ['src/cli/index.ts', 'dist/cli/index.js'];
type Envelope = {
  error: { code: string };
  data: { scope: string; method: string; recordPath: string; targets: unknown[] };
};
type Records = { schemaVersion: number; installations: { agents: string[] }[] };
const envelope = (value: string) => JSON.parse(value) as Envelope;
const recordsAt = (path: string) => JSON.parse(readFileSync(path, 'utf8')) as Records;

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'paneon-init-cli-'));
  const cwd = join(directory, 'project');
  const home = join(directory, 'home');
  mkdirSync(cwd);
  mkdirSync(home);
  const env = {
    ...process.env,
    HOME: home,
    USERPROFILE: home,
    XDG_CONFIG_HOME: join(home, '.config'),
    CLAUDE_CONFIG_DIR: join(home, '.claude'),
  };
  const run = (entry: string, ...args: string[]) => {
    const result = spawnSync(process.execPath, [join(root, entry), ...args], {
      cwd,
      env,
      encoding: 'utf8',
      timeout: 15_000,
    });
    assert.ifError(result.error);
    assert.equal(result.signal, null);
    return result;
  };
  return {
    directory,
    cwd,
    home,
    run,
    dispose: () => rmSync(directory, { recursive: true, force: true }),
  };
}

for (const entry of entries) {
  void test(`${entry}: init help preserves source/built help and version`, () => {
    const f = fixture();
    try {
      for (const args of [['--help'], ['--version'], ['init', '--help']]) {
        const result = f.run(entry, ...args);
        assert.equal(result.status, 0, result.stderr);
        assert.equal(result.stderr, '');
        if (args[0] === 'init') {
          for (const option of [
            '--agent',
            '--project',
            '--global',
            '--copy',
            '--yes',
            '--json',
            '--debug',
          ])
            assert.ok(result.stdout.includes(option));
          assert.match(result.stdout, /claude-code/);
          assert.match(result.stdout, /kiro-cli/);
        }
      }
    } finally {
      f.dispose();
    }
  });

  void test(`${entry}: JSON and piped init require explicit --yes without prompting`, () => {
    const f = fixture();
    try {
      const json = f.run(entry, 'init', '--json');
      assert.equal(json.status, 1);
      assert.equal(envelope(json.stdout).error.code, 'NON_INTERACTIVE_INPUT_REQUIRED');
      assert.equal(json.stdout.trim().split('\n').length, 1);
      assert.equal(json.stderr, '');
      const plain = f.run(entry, 'init');
      assert.equal(plain.status, 1);
      assert.equal(plain.stdout, '');
      assert.match(plain.stderr, /--yes/);
      assert.deepEqual(readdirSync(f.cwd), []);
      assert.deepEqual(readdirSync(f.home), []);
    } finally {
      f.dispose();
    }
  });

  void test(`${entry}: invalid options fail before writing`, () => {
    const f = fixture();
    try {
      for (const args of [
        ['--agent', 'not-an-agent', '--yes'],
        ['--project', '--global', '--yes'],
        ['--agent'],
        ['--unknown'],
      ]) {
        const result = f.run(entry, 'init', ...args, '--json');
        assert.equal(result.status, 1);
        assert.equal(envelope(result.stdout).error.code, 'INVALID_ARGUMENT');
        assert.equal(result.stdout.trim().split('\n').length, 1);
        assert.deepEqual(readdirSync(f.cwd), []);
        assert.deepEqual(readdirSync(f.home), []);
      }
    } finally {
      f.dispose();
    }
  });

  void test(`${entry}: explicit project agents share a stable complete skill and symlink`, () => {
    const f = fixture();
    try {
      const result = f.run(
        entry,
        'init',
        '--agent',
        'codex',
        'claude-code',
        '--project',
        '--yes',
        '--json',
        '--debug',
      );
      assert.equal(result.status, 0, result.stderr);
      const data = envelope(result.stdout).data;
      assert.equal(data.scope, 'project');
      assert.equal(data.method, 'symlink');
      assert.equal(result.stdout.trim().split('\n').length, 1);
      assert.match(result.stderr, /\[debug\] command.start/);
      assert.match(result.stderr, /\[debug\] command.complete/);
      const central = join(f.cwd, '.agents/skills/paneon');
      const claude = join(f.cwd, '.claude/skills/paneon');
      assert.ok(lstatSync(claude).isSymbolicLink());
      assert.equal(
        readFileSync(join(claude, 'SKILL.md'), 'utf8'),
        readFileSync(join(central, 'SKILL.md'), 'utf8'),
      );
      assert.ok(existsSync(join(claude, 'assets/shared/submission.ts')));
      assert.ok(existsSync(join(claude, 'assets/examples/github-pr/github.ts')));
      assert.ok(existsSync(join(claude, 'references/authoring.md')));
      assert.ok(!existsSync(join(f.cwd, '.paneon')));
      const recordPath = join(f.home, '.paneon/skill-installations.json');
      const records = recordsAt(recordPath);
      assert.equal(records.schemaVersion, 1);
      assert.deepEqual([...records.installations[0].agents].sort(), ['claude-code', 'codex']);
      assert.equal(realpathSync(data.recordPath), realpathSync(recordPath));
      assert.ok(!existsSync(join(f.home, '.paneon/runtime.json')));
    } finally {
      f.dispose();
    }
  });

  void test(`${entry}: global copy only installs explicitly selected agent and replaces stale files`, () => {
    const f = fixture();
    try {
      const args = ['init', '--agent', 'claude-code', '--global', '--copy', '--yes', '--json'];
      const first = f.run(entry, ...args);
      assert.equal(first.status, 0, first.stderr);
      const target = join(f.home, '.claude/skills/paneon');
      assert.equal(envelope(first.stdout).data.method, 'copy');
      assert.ok(!lstatSync(target).isSymbolicLink());
      assert.ok(!existsSync(join(f.home, '.agents/skills/paneon')));
      writeFileSync(join(target, 'references/old-file.md'), 'old');
      writeFileSync(join(target, 'SKILL.md'), 'local edits');
      const second = f.run(entry, ...args);
      assert.equal(second.status, 0, second.stderr);
      assert.ok(!existsSync(join(target, 'references/old-file.md')));
      assert.match(readFileSync(join(target, 'SKILL.md'), 'utf8'), /# Paneon/);
      assert.equal(
        recordsAt(join(f.home, '.paneon/skill-installations.json')).installations.length,
        1,
      );
      assert.deepEqual(readdirSync(f.cwd), []);
    } finally {
      f.dispose();
    }
  });

  void test(`${entry}: --yes defaults to Project and Universal without writing all known targets`, () => {
    const f = fixture();
    try {
      const result = f.run(entry, 'init', '--yes', '--json');
      assert.equal(result.status, 0, result.stderr);
      const data = envelope(result.stdout).data;
      assert.equal(data.scope, 'project');
      assert.equal(data.method, 'copy');
      assert.equal(data.targets.length, 1);
      assert.ok(existsSync(join(f.cwd, '.agents/skills/paneon/SKILL.md')));
      assert.ok(!existsSync(join(f.cwd, '.claude')));
      assert.ok(!existsSync(join(f.cwd, '.windsurf')));
    } finally {
      f.dispose();
    }
  });
}
