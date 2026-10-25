import { PACKAGE_VERSION } from '../dist/shared/paths.js';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execute, repositoryRoot } from './acceptance-support.mjs';

const OLD_RUNTIME_VERSION = '0.0.0';

async function controlledRuntime(protocolVersion) {
  const home = await mkdtemp(join(tmpdir(), 'paneon-old-runtime-'));
  const operations = [];
  const child = fork(
    join(repositoryRoot, 'tests/acceptance-old-runtime-worker.mjs'),
    [home, String(protocolVersion), OLD_RUNTIME_VERSION],
    { stdio: ['ignore', 'ignore', 'inherit', 'ipc'] },
  );
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('Controlled old runtime did not start.')),
      10_000,
    );
    child.on('message', (message) => {
      if (message.operation) operations.push(message.operation);
      if (message.ready) {
        clearTimeout(timeout);
        resolve();
      }
    });
    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once('exit', () => {
      clearTimeout(timeout);
      reject(new Error('Controlled old runtime exited before readiness.'));
    });
  });
  const cli = async (...args) => {
    try {
      const result = await execute(
        process.execPath,
        [join(repositoryRoot, 'dist/cli/index.js'), ...args, '--json'],
        { env: { ...process.env, HOME: home }, timeout: 15_000 },
      );
      return { code: 0, output: JSON.parse(result.stdout) };
    } catch (error) {
      return { code: error.code, output: JSON.parse(error.stdout) };
    }
  };
  return {
    cli,
    operations,
    cleanup: async () => {
      if (child.exitCode === null && child.signalCode === null)
        await new Promise((resolve) => {
          child.once('exit', resolve);
          child.kill('SIGTERM');
        });
      await rm(home, { recursive: true, force: true });
    },
  };
}

const compatible = await controlledRuntime(1);
try {
  for (const args of [
    ['server', 'status'],
    [
      'panel',
      'run',
      join(repositoryRoot, 'tests/fixtures/panels/decision-panel.tsx'),
      '--cwd',
      repositoryRoot,
      '--params',
      '{}',
    ],
  ]) {
    const result = await compatible.cli(...args);
    assert.equal(result.code, 1);
    assert.equal(result.output.error.code, 'RUNTIME_VERSION_MISMATCH');
    assert.deepEqual(result.output.error.details, {
      expectedVersion: PACKAGE_VERSION,
      actualVersion: OLD_RUNTIME_VERSION,
    });
  }
  assert.equal(
    compatible.operations.some((path) => path.startsWith('/api/')),
    false,
  );
  const stopped = await compatible.cli('server', 'stop');
  assert.equal(stopped.code, 0);
  assert.equal(stopped.output.data.stopped, true);
  assert.equal(stopped.output.data.alreadyStopped, false);
  assert.equal(compatible.operations.filter((path) => path === '/api/stop').length, 1);
} finally {
  await compatible.cleanup();
}

const incompatible = await controlledRuntime(999);
try {
  for (const args of [
    ['server', 'status'],
    ['server', 'stop'],
  ]) {
    const result = await incompatible.cli(...args);
    assert.equal(result.code, 1);
    assert.equal(result.output.error.code, 'RUNTIME_UNAVAILABLE');
  }
  assert.equal(
    incompatible.operations.some((path) => path.startsWith('/api/')),
    false,
  );
} finally {
  await incompatible.cleanup();
}
console.log(
  'Controlled old runtime: package mismatch rejected, compatible explicit stop accepted, incompatible protocol stop rejected.',
);
