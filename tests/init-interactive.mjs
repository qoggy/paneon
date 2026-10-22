import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Real pseudo-terminal interactions, not mocks of the prompt library. Override
// the package root to repeat the same acceptance against an independently installed tarball.
const root = resolve(
  process.env.PANEON_INIT_PACKAGE_ROOT ?? fileURLToPath(new URL('..', import.meta.url)),
);
const directory = mkdtempSync(join(tmpdir(), 'paneon-init-pty-'));
const home = join(directory, 'home');
const project = join(directory, 'project');
mkdirSync(home);
mkdirSync(project);
const python = String.raw`
import errno, fcntl, json, os, pty, select, signal, struct, subprocess, sys, termios, time
config = json.load(sys.stdin)
master, slave = pty.openpty()
fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', 40, 140, 0, 0))
process = subprocess.Popen(config['command'], cwd=config['cwd'], env=config['env'], stdin=slave, stdout=slave, stderr=slave, start_new_session=True)
os.close(slave)
output = b''
cursor = 0
def read_until(needle):
    global output, cursor
    deadline = time.monotonic() + 20
    while time.monotonic() < deadline:
        if needle.encode() in output[cursor:]:
            cursor = len(output)
            return
        if select.select([master], [], [], 0.1)[0]:
            try:
                data = os.read(master, 65536)
            except OSError as error:
                if error.errno == errno.EIO: break
                raise
            if not data: break
            output += data
        elif process.poll() is not None: break
    raise RuntimeError('Did not see ' + repr(needle) + '\n' + output.decode(errors='replace'))
try:
    for action in config['actions']:
        read_until(action['wait'])
        # Let readline finish wiring the key handler after rendering the prompt.
        time.sleep(0.08)
        os.write(master, action['keys'].encode())
    deadline = time.monotonic() + 20
    while time.monotonic() < deadline:
        if select.select([master], [], [], 0.1)[0]:
            try: data = os.read(master, 65536)
            except OSError as error:
                if error.errno == errno.EIO: break
                raise
            if not data: break
            output += data
        elif process.poll() is not None: break
    code = process.wait(timeout=3)
    print(json.dumps({'code':code,'output':output.decode(errors='replace')}))
finally:
    if process.poll() is None:
        os.killpg(process.pid, signal.SIGKILL)
        process.wait()
    os.close(master)
`;

function terminal(args, actions) {
  const result = spawnSync('python3', ['-c', python], {
    encoding: 'utf8',
    input: JSON.stringify({
      command: [process.execPath, join(root, 'dist/cli/index.js'), 'init', ...args],
      cwd: project,
      env: {
        ...process.env,
        HOME: home,
        USERPROFILE: home,
        XDG_CONFIG_HOME: join(home, '.config'),
        CLAUDE_CONFIG_DIR: join(home, '.claude'),
        TERM: 'xterm-256color',
        NO_COLOR: '1',
      },
      actions,
    }),
    timeout: 120_000,
    maxBuffer: 4 * 1024 * 1024,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  const response = JSON.parse(result.stdout);
  assert.equal(response.code, 0, response.output);
  return response.output;
}

try {
  const cancelled = terminal(
    [],
    [{ wait: 'Which agents do you want to install to?', keys: '\u0003' }],
  );
  assert.match(cancelled, /Installation cancelled/);
  assert.match(cancelled, /"cancelled": true/);
  assert.ok(!existsSync(join(home, '.paneon')));
  assert.ok(!existsSync(join(project, '.agents')));

  const declined = terminal(
    [],
    [
      { wait: 'Which agents do you want to install to?', keys: '\r' },
      { wait: 'Installation scope', keys: '\r' },
      { wait: 'Proceed with installation?', keys: 'n\r' },
    ],
  );
  assert.match(declined, /Universal \(always selected\)/);
  assert.ok(!declined.includes('Installation method'));
  assert.ok(!existsSync(join(project, '.agents')));
  assert.ok(!existsSync(join(home, '.paneon')));

  const installed = terminal(
    [],
    [
      { wait: 'Which agents do you want to install to?', keys: ' \r' },
      { wait: 'Installation scope', keys: '\r' },
      { wait: 'Installation method', keys: '\r' },
      { wait: 'Proceed with installation?', keys: 'y\r' },
    ],
  );
  assert.match(installed, /Symlink \(Recommended\)/);
  assert.match(installed, /Installation Summary/);
  assert.match(installed, /Installation complete/);
  assert.ok(lstatSync(join(project, '.claude/skills/paneon')).isSymbolicLink());
  assert.ok(existsSync(join(project, '.agents/skills/paneon/assets/examples/github-pr/github.ts')));

  const repeated = terminal(
    ['--agent', 'codex', 'claude-code', '--project'],
    [
      { wait: 'Installation method', keys: '\r' },
      { wait: 'Proceed with installation?', keys: 'n\r' },
    ],
  );
  assert.match(repeated, /overwrites:/);
  assert.match(repeated, /"cancelled": true/);

  const copied = terminal(
    ['--agent', 'codex', 'claude-code'],
    [
      { wait: 'Installation scope', keys: '\u001b[B\r' },
      { wait: 'Installation method', keys: '\u001b[B\r' },
      { wait: 'Proceed with installation?', keys: 'y\r' },
    ],
  );
  assert.match(copied, /Copy to all agents/);
  assert.match(copied, /"scope": "global"/);
  assert.match(copied, /"method": "copy"/);
  assert.ok(!lstatSync(join(home, '.claude/skills/paneon')).isSymbolicLink());
  assert.ok(existsSync(join(home, '.agents/skills/paneon/SKILL.md')));
  assert.ok(existsSync(join(home, '.claude/skills/paneon/references/cli.md')));
  const records = JSON.parse(readFileSync(join(home, '.paneon/skill-installations.json'), 'utf8'));
  assert.equal(records.installations.length, 2);
  assert.ok(!existsSync(join(project, '.paneon')));
  assert.ok(!existsSync(join(home, '.paneon/runtime.json')));
  console.log(
    'Passed 5 real PTY scenarios: cancellation, No, Project/Symlink, overwrite summary, Global/Copy.',
  );
} finally {
  rmSync(directory, { recursive: true, force: true });
}
