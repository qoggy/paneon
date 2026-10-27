import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

const { CompilerProcess } = (await import(
  '../dist/compiler/' + 'process.js'
)) as typeof import('../src/compiler/process.js');

async function fixture(run: (root: string, Compiler: typeof CompilerProcess) => Promise<void>) {
  const root = mkdtempSync(join(tmpdir(), 'paneon-compiler-timeout-'));
  const pkg = join(root, 'package');
  mkdirSync(join(pkg, 'dist/compiler'), { recursive: true });
  mkdirSync(join(pkg, 'dist/shared'), { recursive: true });
  writeFileSync(join(pkg, 'package.json'), '{"type":"module","version":"0.0.0"}');
  for (const file of [
    'compiler/process.js',
    'compiler/diagnostics.js',
    'shared/types.js',
    'shared/paths.js',
  ])
    cpSync(join(import.meta.dirname, '../dist', file), join(pkg, 'dist', file));
  const { CompilerProcess: Compiler } = (await import(
    pathToFileURL(join(pkg, 'dist/compiler/process.js')).href
  )) as { CompilerProcess: typeof CompilerProcess };
  try {
    await run(root, Compiler);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function alive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false;
    throw error;
  }
}

async function until(check: () => boolean) {
  const end = Date.now() + 5000;
  while (!check() && Date.now() < end) await delay(10);
  assert.ok(check());
}

void test(
  'hard compilation timeout kills blocked compiler and metadata, cleans staging and permits another build',
  { timeout: 15000 },
  async (t) => {
    await fixture(async (root, Compiler) => {
      const pidFile = join(root, 'metadata-pid');
      const metadata = join(root, 'metadata.mjs');
      const worker = join(root, 'package/dist/compiler/worker.js');
      const buildRoot = join(root, 'output');
      const staging = join(buildRoot, 'sha256-' + 'a'.repeat(64) + '-build');
      const previous = join(buildRoot, 'sha256-' + 'b'.repeat(64));
      mkdirSync(staging, { recursive: true });
      mkdirSync(previous);
      writeFileSync(
        metadata,
        `import{writeFileSync}from'node:fs';writeFileSync(${JSON.stringify(pidFile)},String(process.pid));process.send('ready');while(true){}`,
      );
      writeFileSync(
        worker,
        `import{fork}from'node:child_process';process.once('message',()=>{const child=fork(${JSON.stringify(metadata)},[],{stdio:['ignore','ignore','ignore','ipc'],execArgv:[]});child.once('message',()=>{process.send({metadataReady:true});while(true){}});});`,
      );
      // Process startup must finish before exercising the compilation deadline.
      t.mock.timers.enable({ apis: ['setTimeout'] });
      const compiler = new Compiler('/entry.tsx', buildRoot, 1000);
      const result = assert.rejects(compiler.result, {
        code: 'BUILD_TIMEOUT',
        details: { stage: 'process', entryPath: '/entry.tsx', timeoutMs: 1000, stderr: '' },
      });
      try {
        const [ready] = (await once(compiler.child, 'message')) as [unknown];
        assert.deepEqual(ready, { metadataReady: true });
        t.mock.timers.tick(1000);
        await result;
        t.mock.timers.reset();
        assert.notEqual(compiler.child.exitCode ?? compiler.child.signalCode, null);
        assert.ok(existsSync(pidFile), 'metadata must have started before the timeout');
        const metadataPid = Number(readFileSync(pidFile, 'utf8'));
        await until(() => !alive(metadataPid));
        assert.equal(existsSync(staging), false);
        assert.equal(existsSync(previous), true);
        writeFileSync(
          worker,
          "process.once('message',()=>process.send({ok:true,data:{directory:'/next',manifest:{}}},()=>process.exit(0)));",
        );
        const next = new Compiler('/next.tsx', buildRoot, 2000);
        assert.equal((await next.result).directory, '/next');
        await next.stop();
      } finally {
        t.mock.timers.reset();
        await compiler.stop();
        if (existsSync(pidFile)) {
          const pid = Number(readFileSync(pidFile, 'utf8'));
          if (alive(pid)) process.kill(pid, 'SIGKILL');
        }
      }
    });
  },
);

void test(
  'explicit cancellation remains idempotent and is distinct from timeout',
  { timeout: 10000 },
  async () => {
    await fixture(async (root, Compiler) => {
      const ready = join(root, 'ready');
      writeFileSync(
        join(root, 'package/dist/compiler/worker.js'),
        `import{writeFileSync}from'node:fs';process.once('message',()=>{process.on('SIGTERM',()=>{});writeFileSync(${JSON.stringify(ready)},'ready');while(true){}});`,
      );
      const compiler = new Compiler('/entry.tsx', root, 5000);
      const result = assert.rejects(compiler.result, { code: 'BUILD_CANCELLED' });
      try {
        await until(() => existsSync(ready));
        await Promise.all([compiler.stop(), compiler.stop()]);
        await result;
        assert.notEqual(compiler.child.exitCode ?? compiler.child.signalCode, null);
      } finally {
        await compiler.stop();
      }
    });
  },
);

void test(
  'a reported result cannot turn an over-deadline compiler into success',
  { timeout: 5000 },
  async () => {
    await fixture(async (root, Compiler) => {
      writeFileSync(
        join(root, 'package/dist/compiler/worker.js'),
        "process.once('message',()=>{process.send({ok:true,data:{directory:'/late',manifest:{}}});while(true){}});",
      );
      const compiler = new Compiler('/entry.tsx', root, 500);
      try {
        await assert.rejects(compiler.result, { code: 'BUILD_TIMEOUT' });
        await compiler.stop();
      } finally {
        await compiler.stop();
      }
    });
  },
);
