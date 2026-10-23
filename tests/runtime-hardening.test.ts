import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn, execFile, spawnSync } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  rmSync,
  mkdirSync,
  existsSync,
  cpSync,
  symlinkSync,
  readdirSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import type { Manifest, RuntimeDescriptor } from '../src/shared/types.js';
const { compilePanel, validateRequirement } = (await import(
  '../dist/compiler/' + 'index.js'
)) as typeof import('../src/compiler/index.js');
const { Runtime } = (await import(
  '../dist/runtime/' + 'lifecycle.js'
)) as typeof import('../src/runtime/lifecycle.js');
const execute = promisify(execFile);
const packageRoot = join(import.meta.dirname, '..');
const builtCli = join(packageRoot, 'dist/cli/index.js');
const sourceCli = join(packageRoot, 'src/cli/index.ts');
const packageVersion = (
  JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as { version: string }
).version;
type Envelope = {
  ok: boolean;
  data?: Record<string, unknown>;
  error?: { code: string; message: string; details?: Record<string, unknown> };
};
function directory(prefix: string) {
  return mkdtempSync(join(tmpdir(), prefix));
}
function source(
  id: string,
  range: string,
  options: { marker?: string; moduleMarker?: string; missingApi?: boolean } = {},
) {
  return `import {definePanel,serverAction,z${options.missingApi ? ',nonexistentPaneonApi' : ''}} from 'paneon/sdk';
${options.marker || options.moduleMarker ? `import {appendFileSync} from 'node:fs';` : ''}
${options.moduleMarker ? `const loaded=(appendFileSync(${JSON.stringify(options.moduleMarker)},'loaded\\n'),1);` : ''}
export const invoke=serverAction({kind:'mutation',input:z.object({}),handler:async()=>{${options.marker ? `appendFileSync(${JSON.stringify(options.marker)},'called\\n');` : ''}return {done:true${options.moduleMarker ? ',loaded' : ''}};}});
function Panel(){return <div>${options.missingApi ? '{nonexistentPaneonApi()}' : id}</div>}
export default definePanel({id:${JSON.stringify(id)},requires:{paneon:${JSON.stringify(range)}},input:z.object({topic:z.string().min(1)}),events:{feedback:z.object({text:z.string()})},render:Panel});`;
}
async function cli(
  home: string,
  args: string[],
  entry = builtCli,
  extraEnv: Record<string, string> = {},
) {
  try {
    const result = await execute(process.execPath, [entry, ...args, '--json'], {
      env: { ...process.env, HOME: home, ...extraEnv },
      cwd: tmpdir(),
      timeout: 90000,
    });
    return { ...result, status: 0, result: JSON.parse(result.stdout) as Envelope };
  } catch (error) {
    const failure = error as {
      stdout?: string;
      stderr?: string;
      code?: number | string;
      signal?: string;
    };
    if (failure.stdout)
      return {
        stdout: failure.stdout,
        stderr: failure.stderr ?? '',
        status: failure.code,
        result: JSON.parse(failure.stdout) as Envelope,
      };
    throw error;
  }
}
function descriptor(home: string): RuntimeDescriptor {
  return JSON.parse(readFileSync(join(home, '.paneon/runtime.json'), 'utf8')) as RuntimeDescriptor;
}
async function request(
  runtime: RuntimeDescriptor,
  path: string,
  body?: unknown,
): Promise<Envelope> {
  const response = await fetch(`http://127.0.0.1:${runtime.port}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      Authorization: `Bearer ${runtime.controlToken}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return response.json() as Promise<Envelope>;
}
async function stop(home: string, entry = builtCli) {
  if (existsSync(join(home, '.paneon/runtime.json'))) {
    const result = await cli(home, ['server', 'stop'], entry);
    assert.equal(result.result.ok, true, result.stdout + result.stderr);
  }
}
async function until(check: () => boolean | Promise<boolean>, message: string, timeout = 20000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await check()) return;
    await delay(100);
  }
  assert.fail(message);
}

void test('manifest persists the panel input schema alongside action and event schemas', async () => {
  const root = directory('paneon-schema-');
  const entry = join(root, 'panel.tsx');
  writeFileSync(entry, source('schema', packageVersion));
  try {
    const compiled = await compilePanel(entry, join(root, 'build'));
    const disk = JSON.parse(
      readFileSync(join(compiled.directory, 'manifest.json'), 'utf8'),
    ) as Manifest;
    assert.deepEqual(disk.inputSchema, compiled.manifest.inputSchema);
    const schema = disk.inputSchema as {
      type: string;
      properties: { topic: { type: string; minLength: number } };
      required: string[];
    };
    assert.equal(schema.type, 'object');
    assert.equal(schema.properties.topic.type, 'string');
    assert.equal(schema.properties.topic.minLength, 1);
    assert.deepEqual(schema.required, ['topic']);
    assert.equal(disk.actions.length, 1);
    assert.ok(disk.events.feedback);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

void test('action extraction resolves the value symbol in object shorthand captures', async () => {
  const root = directory('paneon-shorthand-');
  const entry = join(root, 'panel.tsx');
  const marker = join(root, 'evaluated');
  writeFileSync(entry, source('shorthand', packageVersion, { moduleMarker: marker }));
  const runtime = new Runtime(join(root, 'data'));
  try {
    const panel = await runtime.run(entry, root, { topic: 'bound' }, false);
    assert.equal(existsSync(marker), true);
    assert.deepEqual(
      await runtime.invoke(panel.instanceId, panel.revision, 'panel.tsx#invoke', {}),
      { done: true, loaded: 1 },
    );
  } finally {
    await runtime.stop();
    rmSync(root, { recursive: true, force: true });
  }
});

void test('module-level const destructuring is retained while React/function locals stay local', async () => {
  const root = directory('paneon-binding-');
  const entry = join(root, 'panel.tsx');
  writeFileSync(
    entry,
    `import{definePanel,serverAction,z}from'paneon/sdk';const {value,nested:{other},list:[first]}={value:3,nested:{other:4},list:[5]};export const read=serverAction({kind:'query',input:z.object({}),handler:()=>({value,other,first})});function Panel(){const {value}={value:'local UI'};return <div>{value}</div>}export default definePanel({id:'bindings',requires:{paneon:${JSON.stringify(packageVersion)}},input:z.object({}),render:Panel});`,
  );
  const runtime = new Runtime(join(root, 'data'));
  try {
    const panel = await runtime.run(entry, root, {}, false);
    assert.deepEqual(await runtime.invoke(panel.instanceId, panel.revision, 'panel.tsx#read', {}), {
      value: 3,
      other: 4,
      first: 5,
    });
  } finally {
    await runtime.stop();
    rmSync(root, { recursive: true, force: true });
  }
});

void test('semver preflight covers 0.x, prereleases, missing/empty/illegal/dynamic ranges before module execution', async () => {
  const root = directory('paneon-semver-');
  const entry = join(root, 'panel.tsx');
  const marker = join(root, 'must-not-execute');
  try {
    const valid = source('semver', '>=0.0.0 <0.1.0', { moduleMarker: marker });
    writeFileSync(entry, valid);
    assert.equal(validateRequirement(entry, '0.0.1'), '>=0.0.0 <0.1.0');
    assert.throws(() => validateRequirement(entry, '0.1.0'), {
      code: 'PANEON_VERSION_UNSUPPORTED',
    });
    assert.throws(() => validateRequirement(entry, '0.0.1-beta.1'), {
      code: 'PANEON_VERSION_UNSUPPORTED',
    });
    writeFileSync(entry, valid.replace('>=0.0.0 <0.1.0', '>=0.0.1-beta.1 <0.0.1'));
    assert.equal(validateRequirement(entry, '0.0.1-beta.2'), '>=0.0.1-beta.1 <0.0.1');
    const badSources = [
      valid.replace('requires:{paneon:">=0.0.0 <0.1.0"},', ''),
      valid.replace('>=0.0.0 <0.1.0', ''),
      valid.replace('>=0.0.0 <0.1.0', 'not-a-semver-range'),
      valid.replace('paneon:">=0.0.0 <0.1.0"', 'paneon:process.env.PANEON_RANGE'),
    ];
    for (const bad of badSources) {
      writeFileSync(entry, bad);
      await assert.rejects(compilePanel(entry, join(root, 'build')), {
        code: 'INVALID_PANEON_REQUIREMENT',
      });
      assert.equal(existsSync(marker), false);
      assert.equal(readFileSync(entry, 'utf8'), bad);
    }
    writeFileSync(entry, source('semver', '>=99.0.0', { moduleMarker: marker }));
    await assert.rejects(compilePanel(entry, join(root, 'build')), {
      code: 'PANEON_VERSION_UNSUPPORTED',
    });
    assert.equal(existsSync(marker), false);
    writeFileSync(
      entry,
      source('semver', packageVersion, { moduleMarker: marker, missingApi: true }),
    );
    await assert.rejects(compilePanel(entry, join(root, 'build')), (error: unknown) => {
      const failure = error as { code: string; details?: { diagnostic?: string } };
      return (
        failure.code === 'BUILD_FAILED' &&
        Boolean(failure.details?.diagnostic?.includes('nonexistentPaneonApi'))
      );
    });
    assert.equal(existsSync(marker), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

void test(
  'two concurrent CLI runs share one daemon and recover a valid descriptor for a dead process',
  { timeout: 120000 },
  async () => {
    const root = directory('paneon-concurrent-');
    const entry = join(root, 'panel.tsx');
    writeFileSync(entry, source('concurrent', packageVersion));
    mkdirSync(join(root, '.paneon'));
    const gone = spawnSync(process.execPath, ['-e', ''], { encoding: 'utf8' });
    assert.equal(gone.status, 0);
    assert.ok(gone.pid);
    assert.throws(() => process.kill(gone.pid, 0));
    const stale: RuntimeDescriptor = {
      runtimeId: 'dead-runtime',
      pid: gone.pid,
      port: 9,
      controlToken: 'dummy-stale-control',
      paneonVersion: packageVersion,
      protocolVersion: 1,
      startedAt: new Date().toISOString(),
    };
    writeFileSync(join(root, '.paneon/runtime.json'), JSON.stringify(stale));
    try {
      const results = await Promise.all([
        cli(root, [
          'panel',
          'run',
          entry,
          '--cwd',
          root,
          '--params',
          '{"topic":"first"}',
          '--no-watch',
        ]),
        cli(root, [
          'panel',
          'run',
          entry,
          '--cwd',
          root,
          '--params',
          '{"topic":"second"}',
          '--no-watch',
        ]),
      ]);
      for (const result of results)
        assert.equal(result.result.ok, true, result.stdout + result.stderr);
      const first = results[0].result.data!;
      const second = results[1].result.data!;
      assert.notEqual(first.instanceId, second.instanceId);
      assert.equal(new URL(String(first.url)).origin, new URL(String(second.url)).origin);
      const live = descriptor(root);
      assert.notEqual(live.runtimeId, stale.runtimeId);
      const health = await request(live, '/health');
      assert.equal(health.data?.runtimeId, live.runtimeId);
      const list = await cli(root, ['panel', 'list']);
      assert.equal((list.result.data?.panels as unknown[]).length, 2);
      assert.equal(existsSync(join(root, '.paneon/startup.lock')), false);
      const status = await cli(root, ['server', 'status']);
      assert.equal(
        (status.result.data?.runtime as { runtimeId: string }).runtimeId,
        live.runtimeId,
      );
    } finally {
      await stop(root);
      rmSync(root, { recursive: true, force: true });
    }
  },
);

void test('an alive process with an unverifiable health identity is never overwritten or killed', async () => {
  const root = directory('paneon-alive-');
  const entry = join(root, 'panel.tsx');
  writeFileSync(entry, source('alive', packageVersion));
  mkdirSync(join(root, '.paneon'));
  const fake: RuntimeDescriptor = {
    runtimeId: 'unverified-live-runtime',
    pid: process.pid,
    port: 9,
    controlToken: 'dummy-live-control',
    paneonVersion: packageVersion,
    protocolVersion: 1,
    startedAt: new Date().toISOString(),
  };
  const file = join(root, '.paneon/runtime.json');
  const original = JSON.stringify(fake);
  writeFileSync(file, original);
  try {
    for (const args of [
      ['server', 'status'],
      ['server', 'stop'],
      ['panel', 'run', entry, '--cwd', root, '--params', '{"topic":"safe"}'],
    ]) {
      const result = await cli(root, args);
      assert.equal(result.status, 1);
      assert.equal(result.result.error?.code, 'RUNTIME_UNAVAILABLE');
      assert.equal(readFileSync(file, 'utf8'), original);
      process.kill(process.pid, 0);
      assert.equal(existsSync(join(root, '.paneon/startup.lock')), false);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

void test('all panel/server command help remains English, does not start a daemon, and rejects unknown parameters', async () => {
  const root = directory('paneon-help-');
  const commands = [
    ['panel', 'run'],
    ['panel', 'list'],
    ['panel', 'inspect'],
    ['panel', 'reload'],
    ['panel', 'close'],
    ['panel', 'events'],
    ['panel', 'ack'],
    ['server', 'status'],
    ['server', 'stop'],
  ];
  try {
    for (const command of [[], ['panel'], ['server'], ...commands]) {
      const result = await execute(process.execPath, [builtCli, ...command, '--help'], {
        cwd: tmpdir(),
        env: { ...process.env, HOME: root, LANG: 'zh_CN.UTF-8' },
      });
      assert.match(result.stdout, /Usage:/);
      assert.match(result.stdout, /--help/);
      assert.equal(result.stderr, '');
      assert.equal(existsSync(join(root, '.paneon')), false);
    }
    for (const command of commands) {
      const result = await cli(root, [...command, '--not-a-paneon-option']);
      assert.equal(result.status, 1);
      assert.equal(result.result.error?.code, 'INVALID_ARGUMENT');
      assert.equal(existsSync(join(root, '.paneon')), false);
    }
    for (const command of [
      ['panel', '--help'],
      ['server', '--help'],
      ['panel', 'events', '--help'],
      ['server', 'stop', '--help'],
      ['--version'],
    ]) {
      const source = await execute(process.execPath, [sourceCli, ...command], {
        cwd: tmpdir(),
        env: { ...process.env, HOME: root },
      });
      const built = await execute(process.execPath, [builtCli, ...command], {
        cwd: tmpdir(),
        env: { ...process.env, HOME: root },
      });
      assert.equal(source.stdout, built.stdout);
      assert.equal(source.stderr, built.stderr);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

void test('debug stderr contains only fixed framework steps and elapsed time, never credentials or business values', async () => {
  const root = directory('paneon-debug-');
  const entry = join(root, 'panel.tsx');
  const business = 'DUMMY_BUSINESS_中文_body';
  const cookie = 'DUMMY_COOKIE_cookie-value';
  const token = 'DUMMY_ENV_TOKEN_private';
  writeFileSync(entry, source('debug', packageVersion));
  try {
    const run = await cli(
      root,
      [
        '--debug',
        'panel',
        'run',
        entry,
        '--cwd',
        root,
        '--params',
        JSON.stringify({ topic: business }),
        '--no-watch',
      ],
      builtCli,
      { PANEON_DUMMY_TOKEN: token, PANEON_DUMMY_COOKIE: cookie },
    );
    assert.equal(run.result.ok, true, run.stdout + run.stderr);
    const id = String(run.result.data?.instanceId);
    const runtime = descriptor(root);
    const probes = [
      run,
      await cli(root, ['panel', 'inspect', id, '--debug'], builtCli, { PANEON_DUMMY_TOKEN: token }),
      await cli(root, ['--debug', 'server', 'status'], builtCli, { PANEON_DUMMY_COOKIE: cookie }),
    ];
    for (const probe of probes) {
      for (const value of [business, cookie, token, runtime.controlToken])
        assert.equal(probe.stderr.includes(value), false);
      for (const line of probe.stderr.trim().split('\n'))
        assert.match(line, /^\[debug\] command\.(?:start|complete elapsedMs=\d+)$/);
    }
    assert.equal(run.stdout.includes(business), false);
    assert.equal(
      probes[1]?.stdout.includes(business),
      true,
      'inspect deliberately returns saved panel input',
    );
    assert.equal(probes[2]?.stdout.includes(runtime.controlToken), false);
    // Persistent server logs are independent of per-command --debug diagnostics.
    assert.deepEqual(
      readdirSync(join(root, '.paneon')).filter((file) => /log|debug/i.test(file)),
      ['logs'],
    );
    const logText = readFileSync(join(root, '.paneon/logs', `${runtime.runtimeId}.jsonl`), 'utf8');
    for (const value of [business, cookie, token, runtime.controlToken])
      assert.equal(logText.includes(value), false);
    assert.equal(logText.includes('[debug] command.'), false);
  } finally {
    await stop(root);
    rmSync(root, { recursive: true, force: true });
  }
});

void test(
  'a copied upgraded package rebuilds compatible instances and preserves incompatible instance history',
  { timeout: 120000 },
  async () => {
    const root = directory('paneon-upgrade-');
    const home = join(root, 'home');
    mkdirSync(home);
    const exact = join(root, 'exact.tsx');
    const broad = join(root, 'broad.tsx');
    const exactLoaded = join(root, 'exact-loaded');
    const broadLoaded = join(root, 'broad-loaded');
    const called = join(root, 'handler-called');
    writeFileSync(exact, source('exact', '0.0.0', { marker: called, moduleMarker: exactLoaded }));
    writeFileSync(
      broad,
      source('broad', '>=0.0.0 <0.1.0', { marker: called, moduleMarker: broadLoaded }),
    );
    const copyPackage = (version: string, name: string) => {
      const copy = join(root, name);
      mkdirSync(copy);
      cpSync(join(packageRoot, 'dist'), join(copy, 'dist'), { recursive: true });
      const metadata = JSON.parse(
        readFileSync(join(packageRoot, 'package.json'), 'utf8'),
      ) as Record<string, unknown>;
      metadata.version = version;
      writeFileSync(join(copy, 'package.json'), JSON.stringify(metadata));
      symlinkSync(join(packageRoot, 'node_modules'), join(copy, 'node_modules'), 'dir');
      return copy;
    };
    const oldPackage = copyPackage('0.0.0', 'old-package');
    const oldCli = join(oldPackage, 'dist/cli/index.js');
    const old = (args: string[]) => cli(home, args, oldCli);
    let upgraded: ChildProcess | undefined;
    try {
      const created: Record<string, unknown>[] = [];
      for (const entry of [exact, broad]) {
        const result = await old([
          'panel',
          'run',
          entry,
          '--cwd',
          root,
          '--params',
          '{"topic":"saved"}',
          '--no-watch',
        ]);
        assert.equal(result.result.ok, true, result.stdout + result.stderr);
        created.push(result.result.data!);
      }
      const original = descriptor(home);
      const exactId = String(created[0]?.instanceId);
      const broadId = String(created[1]?.instanceId);
      const event = await request(original, `/api/panels/${exactId}/events`, {
        revision: created[0]?.revision,
        type: 'feedback',
        payload: { text: 'survives upgrade' },
      });
      assert.equal(event.ok, true);
      await old(['panel', 'events', exactId, '--consumer', 'upgrade']);
      const exactEvaluations = readFileSync(exactLoaded, 'utf8');
      const broadEvaluations = readFileSync(broadLoaded, 'utf8');
      await stop(home, oldCli);
      const copy = copyPackage('0.0.1', 'upgraded-package');
      const upgradedCli = join(copy, 'dist/cli/index.js');
      upgraded = spawn(process.execPath, [join(copy, 'dist/runtime/index.js')], {
        env: { ...process.env, HOME: home },
        cwd: tmpdir(),
        stdio: 'ignore',
      });
      await until(
        () => existsSync(join(home, '.paneon/runtime.json')),
        'upgraded service did not publish a descriptor',
        45000,
      );
      assert.equal(descriptor(home).paneonVersion, '0.0.1');
      const incompatible = await cli(home, ['panel', 'inspect', exactId], upgradedCli);
      assert.equal(incompatible.result.ok, true, incompatible.stdout);
      assert.equal(incompatible.result.data?.status, 'unavailable');
      assert.equal(
        (incompatible.result.data?.diagnostic as { code: string }).code,
        'PANEON_VERSION_UNSUPPORTED',
      );
      assert.equal(incompatible.result.data?.revision, created[0]?.revision);
      assert.equal(incompatible.result.data?.paneonVersion, '0.0.0');
      assert.equal(readFileSync(exactLoaded, 'utf8'), exactEvaluations);
      const events = await cli(
        home,
        ['panel', 'events', exactId, '--consumer', 'upgrade'],
        upgradedCli,
      );
      assert.equal((events.result.data?.events as unknown[]).length, 1);
      const compatible = await cli(home, ['panel', 'inspect', broadId], upgradedCli);
      assert.equal(compatible.result.data?.status, 'running');
      assert.equal(compatible.result.data?.paneonVersion, '0.0.1');
      assert.notEqual(compatible.result.data?.revision, created[1]?.revision);
      assert.ok(readFileSync(broadLoaded, 'utf8').length > broadEvaluations.length);
      const current = descriptor(home);
      const detail = await request(current, `/api/panels/${broadId}`);
      const manifest = detail.data?.manifest as Manifest;
      assert.equal(manifest.paneonVersion, '0.0.1');
      assert.equal(manifest.revision, compatible.result.data?.revision);
      assert.equal(manifest.requires.paneon, '>=0.0.0 <0.1.0');
      assert.ok(manifest.inputSchema);
      assert.equal(existsSync(called), false);
      assert.equal(
        (JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as { version: string })
          .version,
        packageVersion,
      );
      const mismatch = await old(['server', 'status']);
      assert.equal(mismatch.result.error?.code, 'RUNTIME_VERSION_MISMATCH');
      const oldInspect = await old(['panel', 'inspect', broadId]);
      assert.equal(oldInspect.result.error?.code, 'RUNTIME_VERSION_MISMATCH');
      await stop(home, oldCli);
      await until(
        () => upgraded?.exitCode !== null,
        'old CLI did not finish stopping the compatible-protocol upgraded service',
      );
    } finally {
      if (upgraded && upgraded.exitCode === null && upgraded.signalCode === null) {
        upgraded.kill();
        await new Promise<void>((resolve) => upgraded!.once('exit', () => resolve()));
      }
      if (existsSync(join(home, '.paneon/runtime.json'))) await stop(home, oldCli);
      rmSync(root, { recursive: true, force: true });
    }
  },
);

void test(
  'Vite handles rapid independent saves, final Node code, and correction after an invalid dependency',
  { timeout: 120000 },
  async () => {
    const root = directory('paneon-latest-');
    const entry = join(root, 'panel.tsx');
    const helper = join(root, 'helper.ts');
    const panel = (label: string, prefix: string) =>
      `import{definePanel,serverAction,z}from'paneon/sdk';import{message}from'./helper';export const read=serverAction({kind:'query',input:z.object({}),handler:async()=>({message:${JSON.stringify(prefix)}+message})});function Panel(){return <div>${label}</div>}export default definePanel({id:'latest',requires:{paneon:${JSON.stringify(packageVersion)}},input:z.object({}),render:Panel});`;
    writeFileSync(helper, "export const message='v1';");
    writeFileSync(entry, panel('UI-initial', 'initial:'));
    const runtime = new Runtime(join(root, 'data'));
    try {
      const created = await runtime.run(entry, root, {}, true);
      const writer = spawn(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          `import{writeFileSync}from'node:fs';writeFileSync(${JSON.stringify(helper)},"export const message='v2';");setTimeout(()=>writeFileSync(${JSON.stringify(entry)},${JSON.stringify(panel('UI-final', 'node-final:'))}),150);setTimeout(()=>writeFileSync(${JSON.stringify(helper)},"export const message='v3';"),500);setTimeout(()=>writeFileSync(${JSON.stringify(helper)},"export const message='v4';"),900);`,
        ],
        { stdio: 'ignore' },
      );
      await new Promise<void>((resolve, reject) => {
        writer.once('exit', (code) =>
          code === 0 ? resolve() : reject(new Error('The independent writer failed.')),
        );
      });
      let finalRevision = '';
      await until(
        async () => {
          const current = runtime.inspect(created.instanceId);
          if (current.revision === created.revision || current.diagnostic) return false;
          try {
            const result = (await runtime.invoke(
              created.instanceId,
              current.revision,
              'panel.tsx#read',
              {},
            )) as { message: string };
            if (result.message !== 'node-final:v4') return false;
            finalRevision = current.revision;
            return true;
          } catch {
            return false;
          }
        },
        'the final saved Node handler and dependency never became active',
        35000,
      );
      await delay(1200);
      const live = runtime.live.get(created.instanceId)!;
      const client = live.compiled.manifest.assets
        .filter((name) => name.endsWith('.js'))
        .map((name) => readFileSync(join(live.compiled.directory, 'client', name), 'utf8'))
        .join('');
      assert.match(client, /UI-final/);
      assert.doesNotMatch(client, /UI-initial/);
      const hash = createHash('sha256').update(packageVersion);
      for (const file of live.compiled.manifest.dependencies)
        hash.update(file).update(readFileSync(file));
      assert.equal(live.compiled.manifest.revision, 'sha256:' + hash.digest('hex'));
      assert.equal(runtime.inspect(created.instanceId).revision, finalRevision);
      writeFileSync(helper, 'export const message = ;');
      await until(
        () => runtime.inspect(created.instanceId).diagnostic?.code === 'BUILD_FAILED',
        'invalid dependency did not produce a build diagnostic',
      );
      assert.equal(runtime.inspect(created.instanceId).revision, finalRevision);
      assert.deepEqual(
        await runtime.invoke(created.instanceId, finalRevision, 'panel.tsx#read', {}),
        { message: 'node-final:v4' },
      );
      writeFileSync(helper, "export const message='recovered';");
      await until(async () => {
        const current = runtime.inspect(created.instanceId);
        if (current.diagnostic || current.revision === finalRevision) return false;
        try {
          return (
            (
              (await runtime.invoke(
                created.instanceId,
                current.revision,
                'panel.tsx#read',
                {},
              )) as { message: string }
            ).message === 'node-final:recovered'
          );
        } catch {
          return false;
        }
      }, 'Vite did not recover after the source was corrected');
    } finally {
      await runtime.stop();
      rmSync(root, { recursive: true, force: true });
    }
  },
);
void test(
  'a save after bundle evaluation discards that source snapshot and Vite recovers without publishing it',
  { timeout: 120000 },
  async () => {
    const root = directory('paneon-source-snapshot-');
    const entry = join(root, 'panel.tsx');
    const helper = join(root, 'helper.ts');
    const gate = join(root, 'gate');
    const marker = join(root, 'metadata-source');
    const release = join(root, 'release');
    const sourceFor = (label: string) => `
import{definePanel,serverAction,z}from'paneon/sdk';
import{existsSync,writeFileSync}from'node:fs';import{message}from'./helper';
const held=(()=>{if(existsSync(${JSON.stringify(gate)})){writeFileSync(${JSON.stringify(marker)},message);while(!existsSync(${JSON.stringify(release)})){} }return message;})();
export const read=serverAction({kind:'query',input:z.object({}),handler:async()=>({message:held})});
function Panel(){return <div>${label}</div>}
export default definePanel({id:'snapshot',requires:{paneon:${JSON.stringify(packageVersion)}},input:z.object({}),render:Panel});`;
    writeFileSync(helper, "export const message='original';");
    writeFileSync(entry, sourceFor('Original UI'));
    const runtime = new Runtime(join(root, 'data'));
    try {
      const initial = await runtime.run(entry, root, {}, true);
      writeFileSync(gate, 'hold metadata before publication');
      writeFileSync(entry, sourceFor('Never publish this UI'));
      const updating = runtime.reload(initial.instanceId);
      void updating.catch(() => {});
      await until(() => existsSync(marker), 'the bundled source did not enter metadata evaluation');
      assert.equal(
        readFileSync(marker, 'utf8'),
        'original',
        'The actual Node bundle must still contain the original helper.',
      );
      writeFileSync(helper, 'export const message = ;');
      writeFileSync(release, 'continue after changing source');
      await assert.rejects(updating, { code: 'BUILD_SOURCE_CHANGED' });
      assert.equal(runtime.inspect(initial.instanceId).revision, initial.revision);
      assert.deepEqual(
        await runtime.invoke(initial.instanceId, initial.revision, 'panel.tsx#read', {}),
        { message: 'original' },
      );
      await until(
        () => runtime.inspect(initial.instanceId).diagnostic?.code === 'BUILD_FAILED',
        'the queued invalid-source Vite update was not processed',
      );
      assert.equal(
        runtime.inspect(initial.instanceId).revision,
        initial.revision,
        'A rejected snapshot must never replace the last successful revision.',
      );
      writeFileSync(helper, "export const message='latest';");
      writeFileSync(entry, sourceFor('Recovered UI'));
      await until(async () => {
        const current = runtime.inspect(initial.instanceId);
        if (current.diagnostic || current.revision === initial.revision) return false;
        try {
          return (
            (
              (await runtime.invoke(
                initial.instanceId,
                current.revision,
                'panel.tsx#read',
                {},
              )) as { message: string }
            ).message === 'latest'
          );
        } catch {
          return false;
        }
      }, 'the existing Vite update did not publish the corrected source');
      const recovered = runtime.live.get(initial.instanceId);
      assert.ok(recovered);
      const compiled = recovered.compiled;
      const client = readFileSync(join(compiled.directory, 'client/client.js'), 'utf8');
      assert.match(client, /Recovered UI/);
      assert.doesNotMatch(client, /Never publish this UI/);
      const hash = createHash('sha256').update(packageVersion);
      for (const file of compiled.manifest.dependencies)
        hash.update(file).update(readFileSync(file));
      assert.equal(compiled.manifest.revision, 'sha256:' + hash.digest('hex'));
    } finally {
      writeFileSync(release, 'cleanup');
      await runtime.stop();
      rmSync(root, { recursive: true, force: true });
    }
  },
);
void test(
  'CPU-heavy compilation keeps health and real CLI status responsive and can be cancelled by close/stop',
  { timeout: 120000 },
  async () => {
    const root = directory('paneon-compiler-health-');
    const home = join(root, '.paneon');
    const entry = join(root, 'panel.tsx');
    writeFileSync(entry, source('health', packageVersion));
    const { startServer } = (await import(
      '../dist/runtime/' + 'server.js'
    )) as typeof import('../src/runtime/server.js');
    const service = await startServer(home);
    let stopped = false;
    try {
      const panel = await service.runtime.run(entry, root, { topic: 'healthy' }, false);
      const padding = Array.from(
        { length: 30000 },
        (_, index) => `type Padding${index} = { text: string; count: number };`,
      ).join('\n');
      writeFileSync(entry, padding + '\n' + source('health', packageVersion));
      let settled = false;
      const building = service.runtime.reload(panel.instanceId).finally(() => {
        settled = true;
      });
      const observed: Promise<void>[] = [];
      for (let index = 0; index < 5; index++) {
        const began = Date.now();
        const response = await fetch(`http://127.0.0.1:${service.descriptor.port}/health`, {
          headers: { Authorization: `Bearer ${service.descriptor.controlToken}` },
          signal: AbortSignal.timeout(1500),
        });
        assert.equal(response.status, 200);
        assert.ok(Date.now() - began < 1500, 'health exceeded the original discovery deadline');
        await response.arrayBuffer();
        if (index < 3)
          assert.equal(
            settled,
            false,
            'the responsiveness probes must overlap active CPU-heavy compilation',
          );
        observed.push(
          cli(root, ['server', 'status']).then((result) => {
            assert.equal(result.result.ok, true, result.stdout + result.stderr);
          }),
        );
        await delay(100);
      }
      await Promise.all(observed);
      await building;
      writeFileSync(entry, padding + '\n' + source('close-during-build', packageVersion));
      const cancelled = service.runtime.reload(panel.instanceId);
      void cancelled.catch(() => {});
      await delay(100);
      const closeStarted = Date.now();
      await service.runtime.closePanel(panel.instanceId);
      await assert.rejects(cancelled, { code: 'BUILD_CANCELLED' });
      assert.ok(Date.now() - closeStarted < 3000, 'panel close must terminate its compiler');
      assert.equal(service.runtime.inspect(panel.instanceId).status, 'closed');
      const secondEntry = join(root, 'second.tsx');
      writeFileSync(secondEntry, source('second', packageVersion));
      const second = await service.runtime.run(secondEntry, root, { topic: 'stop' }, false);
      writeFileSync(secondEntry, padding + '\n' + source('stop-during-build', packageVersion));
      const stoppingBuild = service.runtime.reload(second.instanceId);
      void stoppingBuild.catch(() => {});
      await delay(100);
      const stopStarted = Date.now();
      await service.stop();
      stopped = true;
      await assert.rejects(stoppingBuild, { code: 'BUILD_CANCELLED' });
      assert.ok(Date.now() - stopStarted < 3000, 'server stop must terminate its compiler');
    } finally {
      if (!stopped) await service.stop();
      rmSync(root, { recursive: true, force: true });
    }
  },
);
void test(
  'close cleans compiler metadata workers/artifacts and stop cancels unpublished execution initialization',
  { timeout: 120000 },
  async () => {
    const root = directory('paneon-cancel-resources-');
    const entry = join(root, 'panel.tsx');
    writeFileSync(entry, source('cancel-resources', packageVersion));
    const runtime = new Runtime(join(root, 'data'));
    let stopped = false;
    try {
      const panel = await runtime.run(entry, root, { topic: 'cancel' }, false);
      const marker = join(root, 'metadata-pid');
      const stuck = source('cancel-resources', packageVersion)
        .replace(
          "import {definePanel,serverAction,z} from 'paneon/sdk';",
          `import {definePanel,serverAction,z} from 'paneon/sdk';import{writeFileSync}from'node:fs';const held=(()=>{writeFileSync(${JSON.stringify(marker)},String(process.pid));for(;;){}})();`,
        )
        .replace('return {done:true};', 'return {done:true,held};');
      writeFileSync(entry, stuck);
      const compiling = runtime.reload(panel.instanceId);
      void compiling.catch(() => {});
      await until(() => existsSync(marker), 'metadata validation did not start');
      const metadataPid = Number(readFileSync(marker, 'utf8'));
      const artifacts = join(root, 'data/panels', panel.instanceId);
      assert.ok(readdirSync(artifacts).some((name) => name.endsWith('-build')));
      const began = Date.now();
      await runtime.closePanel(panel.instanceId);
      await assert.rejects(compiling, { code: 'BUILD_CANCELLED' });
      assert.ok(Date.now() - began < 3000);
      assert.equal(
        readdirSync(artifacts).some((name) => name.endsWith('-build')),
        false,
      );
      await until(
        () => {
          try {
            process.kill(metadataPid, 0);
            return false;
          } catch {
            return true;
          }
        },
        'the metadata process survived compiler cancellation',
        5000,
      );
      const secondEntry = join(root, 'initializing.tsx');
      writeFileSync(secondEntry, source('initializing', packageVersion));
      const second = await runtime.run(secondEntry, root, { topic: 'init' }, false);
      writeFileSync(
        secondEntry,
        source('initializing', packageVersion).replace(
          'input:z.object({topic:z.string().min(1)})',
          'input:z.object({topic:z.string().min(1)}).refine(()=>{for(;;){}})',
        ),
      );
      const initializingBuild = runtime.reload(second.instanceId);
      void initializingBuild.catch(() => {});
      const waiting = (
        runtime as unknown as { initializing: Map<string, { child: { pid?: number } }> }
      ).initializing;
      await until(() => waiting.has(second.instanceId), 'execution initialization was not tracked');
      const executionPid = waiting.get(second.instanceId)?.child.pid;
      assert.ok(executionPid);
      const stopAt = Date.now();
      await runtime.stop();
      stopped = true;
      await assert.rejects(initializingBuild);
      assert.ok(
        Date.now() - stopAt < 3000,
        'stop waited for the 15-second execution-ready timeout',
      );
      assert.equal(waiting.size, 0);
      assert.throws(() => process.kill(executionPid, 0));
    } finally {
      if (!stopped) await runtime.stop();
      rmSync(root, { recursive: true, force: true });
    }
  },
);
