import { PACKAGE_VERSION, copyPanelFixtures } from './panel-fixture.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, realpathSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { prepareRuntimeHome } from './runtime-fixture.ts';
import { setTimeout as delay } from 'node:timers/promises';
import { spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { WebSocket } from 'ws';
const { Runtime } = (await import(
  '../dist/runtime/' + 'lifecycle.js'
)) as typeof import('../src/runtime/lifecycle.js');
void test('the GitHub fixture panel compiles its type-only server model imports', async () => {
  const root = mkdtempSync(join(tmpdir(), 'paneon-gh-panel-'));
  const runtime = new Runtime(join(root, 'data'));
  try {
    await copyPanelFixtures(new URL('./fixtures/panels/', import.meta.url), join(root, 'fixtures'));
    const panel = await runtime.run(
      join(root, 'fixtures/gh-panel.tsx'),
      root,
      { repository: 'cli/cli' },
      false,
    );
    assert.equal(panel.status, 'running');
    const live = runtime.live.get(panel.instanceId);
    assert.ok(live);
    assert.deepEqual(live.compiled.manifest.actions.map((action) => action.id).sort(), [
      `@qoggy/paneon@${PACKAGE_VERSION}/image#readImage`,
      `@qoggy/paneon@${PACKAGE_VERSION}/markdown#readLocalFile`,
      'gh-panel.tsx#listPullRequests',
      'gh-panel.tsx#viewPullRequest',
    ]);
    const client = live.compiled.manifest.assets
      .filter((asset) => asset.endsWith('.js'))
      .map((asset) => readFileSync(join(live.compiled.directory, 'client', asset), 'utf8'))
      .join('');
    assert.doesNotMatch(client, /node:child_process|repositoryPullRequests|pullRequestDetail/);
    const server = readFileSync(join(live.compiled.directory, 'server/server.js'), 'utf8');
    assert.match(server, /node:child_process/);
  } finally {
    await runtime.stop();
    rmSync(root, { recursive: true, force: true });
  }
});
void test('real external TSX separates handler code, runs in cwd, persists events, validates input, and restores without replay', async () => {
  const root = mkdtempSync(join(tmpdir(), 'paneon-integration-'));
  const data = join(root, 'data');
  const entry = join(root, 'panel.tsx');
  const sideEffect = join(root, 'called.txt');
  const source = `import{definePanel,serverAction,z}from'@qoggy/paneon/sdk';import{Button}from'@qoggy/paneon/ui';import{appendFileSync}from'node:fs';export const run=serverAction({input:z.object({text:z.string()}),handler:async(_ctx,input)=>{appendFileSync(${JSON.stringify(sideEffect)},'call\\n');return{cwd:process.cwd(),text:input.text,marker:'SERVER_ONLY_HANDLER_MARKER'};}});function Panel(){return <Button onClick={()=>run({text:'中文'})}>Run</Button>}export default definePanel({id:'external',requires:{paneon:'${PACKAGE_VERSION}'},input:z.object({}),events:{feedback:z.object({text:z.string()})},render:Panel});`;
  writeFileSync(entry, source);
  let runtime = new Runtime(data);
  try {
    const p = await runtime.run(entry, root, {}, false);
    const live = runtime.live.get(p.instanceId)!;
    const client = live.compiled.manifest.assets
      .filter((p) => p.endsWith('.js'))
      .map((asset) => readFileSync(join(live.compiled.directory, 'client', asset), 'utf8'))
      .join('');
    assert.doesNotMatch(client, /SERVER_ONLY_HANDLER_MARKER|appendFileSync|node:fs/);
    const server = readFileSync(join(live.compiled.directory, 'server/server.js'), 'utf8');
    assert.doesNotMatch(server, /function Panel\(/);
    const result = (await runtime.invoke(p.instanceId, p.revision, 'panel.tsx#run', {
      text: '中文',
    })) as { cwd: string; text: string };
    assert.equal(result.cwd, realpathSync(root));
    assert.equal(result.text, '中文');
    await assert.rejects(runtime.invoke(p.instanceId, p.revision, 'panel.tsx#run', { text: 7 }), {
      code: 'INPUT_VALIDATION_FAILED',
    });
    await assert.rejects(runtime.append(p.instanceId, p.revision, 'unknown', {}), {
      code: 'INVALID_EVENT',
    });
    const event = await runtime.append(p.instanceId, p.revision, 'feedback', { text: '反馈' });
    assert.equal((await runtime.events(p.instanceId, 'agent', 100, 0)).events[0]?.id, event.id);
    runtime.store.ack(p.instanceId, 'agent', event.id);
    await runtime.stop();
    runtime = new Runtime(data);
    await runtime.restore();
    assert.equal(readFileSync(sideEffect, 'utf8'), 'call\n');
    assert.equal((await runtime.events(p.instanceId, 'agent', 100, 0)).events.length, 0);
    assert.equal((await runtime.events(p.instanceId, 'other', 100, 0)).events.length, 1);
    writeFileSync(entry, source.replace(`paneon:'${PACKAGE_VERSION}'`, "paneon:'>=99.0.0'"));
    const previous = runtime.inspect(p.instanceId).revision;
    await assert.rejects(runtime.reload(p.instanceId), { code: 'PANEON_VERSION_UNSUPPORTED' });
    assert.equal(runtime.inspect(p.instanceId).revision, previous);
    assert.equal(runtime.inspect(p.instanceId).status, 'running');
    await runtime.closePanel(p.instanceId);
    assert.equal((await runtime.events(p.instanceId, 'other', 100, 0)).events.length, 1);
  } finally {
    await runtime.stop();
    rmSync(root, { recursive: true, force: true });
  }
});
void test('Vite source watching updates a local CSS dependency and retains a failed-build revision', async () => {
  const root = mkdtempSync(join(tmpdir(), 'paneon-watch-'));
  const entry = join(root, 'panel.tsx');
  const css = join(root, 'panel.css');
  writeFileSync(css, '.marker{color:red}');
  writeFileSync(
    entry,
    `import{definePanel,z}from'@qoggy/paneon/sdk';import './panel.css';function Panel(){return <div className='marker'>Watch</div>}export default definePanel({id:'watch',requires:{paneon:'${PACKAGE_VERSION}'},input:z.object({}),render:Panel});`,
  );
  const runtime = new Runtime(join(root, 'data'));
  try {
    const p = await runtime.run(entry, root, {}, true);
    await delay(400);
    writeFileSync(css, '.marker{color:blue}');
    let changed = false;
    for (let i = 0; i < 150; i++) {
      await delay(100);
      if (runtime.inspect(p.instanceId).revision !== p.revision) {
        changed = true;
        break;
      }
    }
    assert.equal(changed, true, 'a reachable CSS edit must trigger a successful toolchain rebuild');
  } finally {
    await runtime.stop();
    rmSync(root, { recursive: true, force: true });
  }
});
void test('CLI rejects corrupted descriptors rather than pretending the service is stopped', () => {
  const root = mkdtempSync(join(tmpdir(), 'paneon-corrupt-'));
  try {
    mkdirSync(join(root, '.paneon'));
    writeFileSync(join(root, '.paneon/runtime.json'), '{broken');
    const result = spawnSync(
      process.execPath,
      [join(import.meta.dirname, '../dist/cli/index.js'), 'server', 'status', '--json'],
      { env: { ...process.env, HOME: root }, encoding: 'utf8' },
    );
    assert.equal(result.status, 1);
    assert.equal(
      (JSON.parse(result.stdout) as { error: { code: string } }).error.code,
      'RUNTIME_UNAVAILABLE',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
void test('real CLI watch choices, compact command results, English debug, and explicit events work across processes', async () => {
  const root = mkdtempSync(join(tmpdir(), 'paneon-cli-integration-'));
  const entry = join(root, 'panel.tsx');
  writeFileSync(
    entry,
    `import{definePanel,z}from'@qoggy/paneon/sdk';function Panel(){return <div>CLI</div>}export default definePanel({id:'cli',requires:{paneon:'${PACKAGE_VERSION}'},input:z.object({topic:z.string()}),events:{feedback:z.object({text:z.string()})},render:Panel});`,
  );
  const { startServer } =
    (await import('./runtime-fixture.ts')) as typeof import('../src/runtime/server.js');
  const service = await startServer(join(root, '.paneon'));
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const execute = promisify(execFile);
  const cli = async (...args: string[]) => {
    const result = await execute(
      process.execPath,
      [join(import.meta.dirname, '../dist/cli/index.js'), ...args, '--json'],
      { env: { ...process.env, HOME: root, LANG: 'zh_CN.UTF-8' }, cwd: tmpdir() },
    );
    return {
      ...result,
      result: JSON.parse(result.stdout) as { ok: boolean; data: Record<string, unknown> },
    };
  };
  try {
    const runs: Record<string, unknown>[] = [];
    for (const flags of [[], ['--watch'], ['--no-watch']]) {
      const result = await cli(
        'panel',
        'run',
        entry,
        '--cwd',
        root,
        '--params',
        '{"topic":"中文"}',
        ...flags,
      );
      assert.equal(result.result.ok, true);
      runs.push(result.result.data);
      assert.deepEqual(Object.keys(result.result.data).sort(), [
        'definitionId',
        'instanceId',
        'paneonVersion',
        'revision',
        'status',
        'url',
        'watch',
      ]);
      assert.equal(result.result.data.watch, !flags.includes('--no-watch'));
    }
    for (const flags of [
      ['--watch', '--no-watch'],
      ['--no-watch', '--watch'],
    ])
      await assert.rejects(
        cli('panel', 'run', entry, '--cwd', root, '--params', '{"topic":"中文"}', ...flags),
        (error) => {
          const e = error as { stdout: string };
          return (
            (JSON.parse(e.stdout) as { error: { code: string } }).error.code === 'INVALID_ARGUMENT'
          );
        },
      );
    const id = String(runs[2]?.instanceId);
    const details = await cli('panel', 'inspect', id);
    assert.equal(details.result.data.manifest, undefined);
    assert.deepEqual(details.result.data.params, { topic: '中文' });
    const debug = await cli('panel', 'inspect', id, '--debug');
    assert.deepEqual(details.result.data, debug.result.data);
    assert.match(debug.stderr, /\[debug\] command.complete/);
    assert.doesNotMatch(debug.stderr, /中文|controlToken|params/);
    const p = service.runtime.store.get(id);
    const waiting = service.runtime.events(id, 'waiting', 100, 2000);
    await delay(30);
    const event = await service.runtime.append(id, p.revision, 'feedback', { text: '跨进程' });
    assert.equal((await waiting).events[0]?.id, event.id);
    const events = await cli('panel', 'events', id, '--consumer', 'cli');
    assert.equal(events.result.data.instanceId, undefined);
    assert.equal(events.result.data.consumer, undefined);
    assert.deepEqual(Object.keys(events.result.data).sort(), [
      'events',
      'hasMore',
      'lastAckId',
      'lastDeliveredId',
      'timedOut',
    ]);
    const ack = await cli('panel', 'ack', id, '--consumer', 'cli', '--through', String(event.id));
    assert.deepEqual(ack.result.data, { lastAckId: event.id });
    const closed = await cli('panel', 'close', id);
    assert.deepEqual(closed.result.data, { status: 'closed', alreadyClosed: false });
    assert.equal(service.runtime.store.get(id).status, 'closed');
  } finally {
    await service.stop();
    rmSync(root, { recursive: true, force: true });
  }
});
void test('actual SVG imports are handled by Vite and resource changes update the revision', async () => {
  const root = mkdtempSync(join(tmpdir(), 'paneon-svg-'));
  const entry = join(root, 'panel.tsx');
  const svg = join(root, 'logo.svg');
  writeFileSync(svg, '<svg xmlns="http://www.w3.org/2000/svg"><circle r="10"/></svg>');
  writeFileSync(
    entry,
    `import{definePanel,z}from'@qoggy/paneon/sdk';import logo from './logo.svg';function Panel(){return <img src={logo} alt='Local SVG'/>}export default definePanel({id:'svg',requires:{paneon:'${PACKAGE_VERSION}'},input:z.object({}),render:Panel});`,
  );
  const runtime = new Runtime(join(root, 'data'));
  try {
    const p = await runtime.run(entry, root, {}, true);
    assert.ok(runtime.manifest(p.instanceId)?.dependencies.includes(realpathSync(svg)));
    await delay(200);
    writeFileSync(
      svg,
      '<svg xmlns="http://www.w3.org/2000/svg"><rect width="20" height="20"/></svg>',
    );
    let updated = false;
    for (let i = 0; i < 150; i++) {
      await delay(100);
      if (runtime.inspect(p.instanceId).revision !== p.revision) {
        updated = true;
        break;
      }
    }
    assert.equal(updated, true);
  } finally {
    await runtime.stop();
    rmSync(root, { recursive: true, force: true });
  }
});
void test('a real daemon and CLI stop complete while a framework WebSocket stays open', async () => {
  const root = mkdtempSync(join(tmpdir(), 'paneon-stop-websocket-'));
  const home = join(root, '.paneon');
  prepareRuntimeHome(home);
  const { Store } = (await import(
    '../dist/runtime/' + 'store.js'
  )) as typeof import('../src/runtime/store.js');
  const store = new Store(home);
  store.save({
    instanceId: '1',
    definitionId: 'websocket',
    status: 'closed',
    entryPath: '/not-loaded.tsx',
    cwd: root,
    params: {},
    revision: 'saved',
    watch: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    requires: { paneon: PACKAGE_VERSION },
    paneonVersion: PACKAGE_VERSION,
  });
  store.close();
  const { spawn, execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const child = spawn(process.execPath, [join(import.meta.dirname, '../dist/runtime/index.js')], {
    env: { ...process.env, HOME: root },
    stdio: 'ignore',
  });
  const exited = new Promise<number | null>((resolve) => child.once('exit', resolve));
  let descriptor: { port: number; controlToken: string } | undefined;
  let socket: WebSocket | undefined;
  try {
    for (let i = 0; i < 100; i++) {
      await delay(50);
      try {
        descriptor = JSON.parse(readFileSync(join(home, 'runtime.json'), 'utf8')) as {
          port: number;
          controlToken: string;
        };
        break;
      } catch {
        /* service is still starting */
      }
    }
    assert.ok(descriptor);
    socket = new WebSocket(`ws://127.0.0.1:${descriptor.port}/api/panels/1/stream`, {
      origin: `http://127.0.0.1:${descriptor.port}`,
    });
    const initial = once(socket, 'message');
    await once(socket, 'open');
    const initialState = JSON.parse(String((await initial)[0])) as { status: string };
    assert.equal(initialState.status, 'closed');
    const closed = once(socket, 'close');
    const result = await promisify(execFile)(
      process.execPath,
      [join(import.meta.dirname, '../dist/cli/index.js'), 'server', 'stop', '--json'],
      { env: { ...process.env, HOME: root }, timeout: 10000 },
    );
    assert.equal((JSON.parse(result.stdout) as { data: { stopped: boolean } }).data.stopped, true);
    assert.equal(await exited, 0);
    await closed;
  } finally {
    socket?.terminate();
    if (child.exitCode === null && child.signalCode === null) {
      child.kill();
      await exited;
    }
    rmSync(root, { recursive: true, force: true });
  }
});
