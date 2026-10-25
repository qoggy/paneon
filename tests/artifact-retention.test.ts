import { PACKAGE_VERSION } from '../dist/shared/paths.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  existsSync,
  realpathSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import pino from 'pino';

const { Runtime } = (await import(
  '../dist/runtime/' + 'lifecycle.js'
)) as typeof import('../src/runtime/lifecycle.js');
const { Artifacts } = (await import(
  '../dist/runtime/' + 'artifacts.js'
)) as typeof import('../src/runtime/artifacts.js');
const { startServer } = (await import(
  '../dist/runtime/' + 'server.js'
)) as typeof import('../src/runtime/server.js');
const revision = (letter: string) => 'sha256:' + letter.repeat(64);
const instance = () => 'instance-' + randomUUID();
function directory() {
  return realpathSync(mkdtempSync(join(tmpdir(), 'paneon-retention-')));
}
function output(home: string, id: string, hash: string) {
  const path = join(home, 'panels', id, hash.replace(':', '-'));
  mkdirSync(path, { recursive: true });
  writeFileSync(join(path, 'manifest.json'), JSON.stringify({ revision: hash }));
  return path;
}
function source(id = 'retention', input = 'z.object({})') {
  return `import{definePanel,serverAction,z}from'@qoggy/paneon/sdk';export const read=serverAction({input:z.object({}),handler:async()=>({id:${JSON.stringify(id)}})});function Panel(){return <div>${id}</div>}export default definePanel({id:${JSON.stringify(id)},requires:{paneon:'${PACKAGE_VERSION}'},input:${input},events:{done:z.object({text:z.string()})},render:Panel});`;
}
async function until(check: () => boolean | Promise<boolean>, message: string) {
  const deadline = Date.now() + 15000;
  while (!(await check()) && Date.now() < deadline) await delay(20);
  assert.equal(await check(), true, message);
}

void test('pruning removes only known real output directories and invalidates cached manifests', async () => {
  const root = directory();
  try {
    const home = join(root, 'data'),
      id = instance();
    const current = output(home, id, revision('a'));
    const old = output(home, id, revision('b'));
    const build = old + '-build';
    mkdirSync(build);
    const panelRoot = join(home, 'panels', id);
    writeFileSync(join(panelRoot, 'user.txt'), 'keep');
    mkdirSync(join(panelRoot, 'unknown'));
    const outside = join(root, 'source');
    mkdirSync(outside);
    writeFileSync(join(outside, 'important.ts'), 'keep');
    symlinkSync(outside, join(panelRoot, revision('c').replace(':', '-')), 'dir');
    const linkedId = instance();
    symlinkSync(outside, join(home, 'panels', linkedId), 'dir');
    mkdirSync(join(home, 'panels', 'unrelated'));
    const artifacts = new Artifacts(home);
    assert.ok(artifacts.read(id, revision('b')));
    assert.deepEqual(await artifacts.instances(), [id]);
    await artifacts.prune(id, revision('a'));
    assert.equal(existsSync(current), true);
    assert.equal(existsSync(old), false);
    assert.equal(existsSync(build), false);
    assert.equal(artifacts.read(id, revision('b')), undefined);
    await artifacts.prune(id);
    await artifacts.prune(linkedId);
    assert.equal(existsSync(current), false);
    assert.equal(readFileSync(join(panelRoot, 'user.txt'), 'utf8'), 'keep');
    assert.equal(existsSync(join(panelRoot, 'unknown')), true);
    assert.equal(readFileSync(join(outside, 'important.ts'), 'utf8'), 'keep');
    await artifacts.prune(instance());
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

void test('failed first run cleans published output without creating history', async () => {
  const root = directory(),
    home = join(root, 'data'),
    entry = join(root, 'panel.tsx');
  const runtime = new Runtime(home);
  try {
    writeFileSync(entry, source('invalid', 'z.object({required:z.string()})'));
    await assert.rejects(runtime.run(entry, root, {}, false), { code: 'INPUT_VALIDATION_FAILED' });
    assert.equal(runtime.store.all().length, 0);
    assert.deepEqual(readdirSync(join(home, 'panels')), []);
    assert.equal(runtime.resourceUsage.residentPanels, 0);
  } finally {
    await runtime.stop();
    rmSync(root, { recursive: true, force: true });
  }
});

void test('publication keeps only current output while failed and same-hash reloads preserve it', async () => {
  const root = directory(),
    home = join(root, 'data'),
    entry = join(root, 'panel.tsx');
  const runtime = new Runtime(home);
  try {
    writeFileSync(entry, source('first'));
    const panel = await runtime.run(entry, root, {}, false);
    const original = runtime.artifact(panel.instanceId, panel.revision);
    assert.ok(original);
    assert.ok(runtime.manifest(panel.instanceId));
    writeFileSync(entry, source('second'));
    const next = await runtime.reload(panel.instanceId);
    assert.equal(existsSync(original.directory), false);
    const current = runtime.artifact(panel.instanceId, next.revision);
    assert.ok(current);
    assert.equal(existsSync(join(current.directory, 'client/frame.html')), true);
    await runtime.reload(panel.instanceId);
    assert.equal(existsSync(current.directory), true);
    writeFileSync(entry, source('rejected', 'z.object({required:z.string()})'));
    await assert.rejects(runtime.reload(panel.instanceId), { code: 'INPUT_VALIDATION_FAILED' });
    assert.equal(runtime.inspect(panel.instanceId).revision, next.revision);
    assert.deepEqual(readdirSync(join(home, 'panels', panel.instanceId)), [
      next.revision.replace(':', '-'),
    ]);
    writeFileSync(entry, 'invalid TypeScript');
    await assert.rejects(runtime.reload(panel.instanceId), { code: 'INVALID_PANEON_REQUIREMENT' });
    assert.equal(existsSync(current.directory), true);
    assert.deepEqual(await runtime.invoke(panel.instanceId, next.revision, 'panel.tsx#read', {}), {
      id: 'second',
    });
    const event = await runtime.append(panel.instanceId, next.revision, 'done', {
      text: 'history',
    });
    await runtime.events(panel.instanceId, 'reader', 100, 0);
    await runtime.closePanel(panel.instanceId);
    assert.equal(existsSync(join(home, 'panels', panel.instanceId)), false);
    assert.equal(runtime.inspect(panel.instanceId).status, 'closed');
    assert.equal(runtime.inspect(panel.instanceId).manifest, undefined);
    assert.equal(
      (await runtime.events(panel.instanceId, 'reader', 100, 0)).events[0]?.id,
      event.id,
    );
    runtime.store.ack(panel.instanceId, 'reader', event.id);
    assert.equal((await runtime.events(panel.instanceId, 'reader', 100, 0)).events.length, 0);
    assert.equal((await runtime.closePanel(panel.instanceId)).alreadyClosed, true);
    assert.equal(readFileSync(entry, 'utf8'), 'invalid TypeScript');
  } finally {
    await runtime.stop();
    rmSync(root, { recursive: true, force: true });
  }
});

void test('startup sweep preserves cold current output and SQL history and leaves unknown content', async () => {
  const root = directory(),
    home = join(root, 'data'),
    entry = join(root, 'panel.tsx');
  let runtime = new Runtime(home);
  try {
    writeFileSync(entry, source());
    const panel = await runtime.run(entry, root, {}, false);
    const event = await runtime.append(panel.instanceId, panel.revision, 'done', {
      text: 'stored',
    });
    runtime.store.read(panel.instanceId, 'reader', 100);
    runtime.store.ack(panel.instanceId, 'reader', event.id);
    const unavailable = instance(),
      closed = instance(),
      orphan = instance();
    for (const [id, status] of [
      [unavailable, 'unavailable'],
      [closed, 'closed'],
    ] as const) {
      runtime.store.save({
        ...runtime.store.get(panel.instanceId),
        instanceId: id,
        revision: revision('b'),
        status,
      });
      output(home, id, revision('b'));
    }
    const old = output(home, panel.instanceId, revision('c'));
    const temporary = old + '-build';
    mkdirSync(temporary);
    output(home, orphan, revision('d'));
    const unknown = join(home, 'panels', 'user-source');
    mkdirSync(unknown);
    writeFileSync(join(unknown, 'source.ts'), 'preserve');
    await runtime.stop();
    runtime = new Runtime(home);
    await runtime.restore();
    await runtime.collectArtifacts();
    assert.equal(existsSync(old), false);
    assert.equal(existsSync(temporary), false);
    assert.equal(existsSync(join(home, 'panels', orphan)), false);
    assert.equal(existsSync(join(home, 'panels', closed)), false);
    assert.equal(
      existsSync(join(home, 'panels', unavailable, revision('b').replace(':', '-'))),
      true,
    );
    assert.ok(runtime.artifact(panel.instanceId, panel.revision));
    assert.equal(runtime.resourceUsage.residentPanels, 0);
    assert.equal((await runtime.events(panel.instanceId, 'reader', 100, 0)).events.length, 0);
    assert.equal((await runtime.events(panel.instanceId, 'other', 100, 0)).events[0]?.id, event.id);
    assert.equal(readFileSync(join(unknown, 'source.ts'), 'utf8'), 'preserve');
  } finally {
    await runtime.stop();
    rmSync(root, { recursive: true, force: true });
  }
});

void test('sweep waits for first-run publication rather than deleting its unpublished build', async () => {
  const root = directory(),
    home = join(root, 'data'),
    entry = join(root, 'panel.tsx');
  const marker = join(root, 'metadata'),
    release = join(root, 'release');
  const runtime = new Runtime(home);
  try {
    writeFileSync(
      entry,
      source()
        .replace(
          "import{definePanel,serverAction,z}from'@qoggy/paneon/sdk';",
          `import{definePanel,serverAction,z}from'@qoggy/paneon/sdk';import{writeFileSync,existsSync}from'node:fs';const gate=await new Promise<number>(resolve=>{writeFileSync(${JSON.stringify(marker)},'ready');const timer=setInterval(()=>{if(existsSync(${JSON.stringify(release)})){clearInterval(timer);resolve(1)}},10)});`,
        )
        .replace('handler:async()=>({id:', 'handler:async()=>({gate,id:'),
    );
    const running = runtime.run(entry, root, {}, false);
    await until(() => existsSync(marker), 'metadata gate was not entered');
    let swept = false;
    const sweeping = runtime.collectArtifacts().then(() => {
      swept = true;
    });
    await delay(50);
    assert.equal(swept, false);
    writeFileSync(release, 'go');
    const panel = await running;
    await sweeping;
    assert.equal(
      existsSync(
        join(
          home,
          'panels',
          panel.instanceId,
          panel.revision.replace(':', '-'),
          'client/frame.html',
        ),
      ),
      true,
    );
  } finally {
    writeFileSync(release, 'cleanup');
    await runtime.stop();
    rmSync(root, { recursive: true, force: true });
  }
});

void test('listen is usable before sweep finishes and stop waits before closing SQLite', async () => {
  const root = directory(),
    home = join(root, 'data'),
    orphan = instance();
  mkdirSync(home);
  writeFileSync(join(home, 'config.json'), JSON.stringify({ server: { port: 0 } }));
  output(home, orphan, revision('a'));
  const original = Object.getOwnPropertyDescriptor(Artifacts.prototype, 'prune')
    ?.value as typeof Artifacts.prototype.prune;
  let enter!: () => void, release!: () => void;
  const entered = new Promise<void>((resolve) => {
    enter = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  Artifacts.prototype.prune = async function (id, keep) {
    if (id === orphan) {
      enter();
      await gate;
    }
    return original.call(this, id, keep);
  };
  let service: Awaited<ReturnType<typeof startServer>> | undefined;
  try {
    service = await startServer(home);
    await entered;
    const response = await service.app.inject({
      method: 'GET',
      url: '/health',
      headers: {
        host: `127.0.0.1:${service.descriptor.port}`,
        authorization: 'Bearer ' + service.descriptor.controlToken,
      },
    });
    assert.equal(response.statusCode, 200);
    let stopped = false;
    const stopping = service.stop().then(() => {
      stopped = true;
    });
    await delay(50);
    assert.equal(stopped, false);
    assert.equal(service.runtime.store.listPage().total, 0);
    release();
    await stopping;
    service = undefined;
    assert.equal(existsSync(join(home, 'panels', orphan)), false);
  } finally {
    release();
    Artifacts.prototype.prune = original;
    await service?.stop();
    rmSync(root, { recursive: true, force: true });
  }
});

void test('a daemon failing to listen cannot sweep the active daemon output', async () => {
  const root = directory(),
    home = join(root, 'data');
  mkdirSync(home);
  writeFileSync(join(home, 'config.json'), JSON.stringify({ server: { port: 0 } }));
  const service = await startServer(home);
  try {
    await service.runtime.collectArtifacts();
    const orphan = instance(),
      path = output(home, orphan, revision('e'));
    writeFileSync(
      join(home, 'config.json'),
      JSON.stringify({ server: { port: service.descriptor.port } }),
    );
    await assert.rejects(startServer(home), { code: 'SERVER_PORT_IN_USE' });
    assert.equal(existsSync(path), true);
  } finally {
    await service.stop();
    rmSync(root, { recursive: true, force: true });
  }
});

void test('cleanup I/O failures are logged without failing a published run', async () => {
  const root = directory(),
    home = join(root, 'data'),
    entry = join(root, 'panel.tsx');
  const logs: string[] = [];
  const logger = pino(
    {},
    {
      write(text: string) {
        logs.push(text);
      },
    },
  );
  const runtime = new Runtime(home, logger);
  const original = Object.getOwnPropertyDescriptor(Artifacts.prototype, 'prune')
    ?.value as typeof Artifacts.prototype.prune;
  Artifacts.prototype.prune = () =>
    Promise.reject(Object.assign(new Error('injected removal failure'), { code: 'EACCES' }));
  try {
    writeFileSync(entry, source());
    const panel = await runtime.run(entry, root, {}, false);
    assert.equal(panel.status, 'running');
    assert.ok(
      logs.some(
        (line) =>
          line.includes('Panel artifact cleanup failed') &&
          line.includes(panel.instanceId) &&
          line.includes('EACCES'),
      ),
    );
    assert.equal(
      existsSync(join(home, 'panels', panel.instanceId, panel.revision.replace(':', '-'))),
      true,
    );
  } finally {
    Artifacts.prototype.prune = original;
    await runtime.stop();
    rmSync(root, { recursive: true, force: true });
  }
});

void test(
  'close overlapping a sweep and compiler cancellation retires resources before deleting output',
  { timeout: 30000 },
  async () => {
    const root = directory(),
      home = join(root, 'data'),
      entry = join(root, 'panel.tsx'),
      marker = join(root, 'metadata'),
      release = join(root, 'release');
    const runtime = new Runtime(home);
    try {
      writeFileSync(entry, source());
      const panel = await runtime.run(entry, root, {}, false);
      writeFileSync(
        entry,
        source('replacement')
          .replace(
            "import{definePanel,serverAction,z}from'@qoggy/paneon/sdk';",
            `import{definePanel,serverAction,z}from'@qoggy/paneon/sdk';import{writeFileSync,existsSync}from'node:fs';const gate=await new Promise<number>(resolve=>{writeFileSync(${JSON.stringify(marker)},'ready');const timer=setInterval(()=>{if(existsSync(${JSON.stringify(release)})){clearInterval(timer);resolve(1)}},10)});`,
          )
          .replace('handler:async()=>({id:', 'handler:async()=>({gate,id:'),
      );
      const reloading = runtime.reload(panel.instanceId);
      void reloading.catch(() => {});
      await until(() => existsSync(marker), 'replacement metadata did not start');
      const sweeping = runtime.collectArtifacts();
      const closing = runtime.closePanel(panel.instanceId);
      await assert.rejects(reloading, { code: 'BUILD_CANCELLED' });
      await Promise.all([sweeping, closing]);
      assert.equal(existsSync(join(home, 'panels', panel.instanceId)), false);
      assert.equal(runtime.resourceUsage.workers, 0);
      assert.equal(runtime.resourceUsage.compiling, 0);
      assert.equal(runtime.inspect(panel.instanceId).status, 'closed');
    } finally {
      writeFileSync(release, 'cleanup');
      await runtime.stop();
      rmSync(root, { recursive: true, force: true });
    }
  },
);
