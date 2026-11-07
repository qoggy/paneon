import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, appendFile, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { startCodex } from './agent-authoring/codex.ts';
import { writeTranscript } from './agent-authoring/trace.ts';
import { prepareExperiment, skillInvocation } from './agent-authoring/experiment.ts';

async function fixture(scenario = 'success') {
  const root = await mkdtemp(join(tmpdir(), 'paneon-agent-authoring-'));
  const cwd = join(root, 'workspace');
  const output = join(root, 'output');
  await mkdir(cwd);
  const request = {
    prompt: '编写面板🙂\n保留完整工具输入输出。',
    cwd,
    output,
    model: 'explicit-model',
    config: ['model_reasoning_effort=medium'],
    executable: process.execPath,
    executableArgs: [new URL('./fixtures/fake-codex.mjs', import.meta.url).pathname],
    env: { CODEX_HOME: join(root, 'codex-home'), MOCK_CODEX_SCENARIO: scenario },
  };
  return { root, request, cleanup: () => rm(root, { recursive: true, force: true }) };
}

async function waitFor(path: string) {
  for (;;) {
    try {
      return await readFile(path, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      await delay(10);
    }
  }
}

void test('runs a CLI with stdin and retains exact rollout, tool arguments/results and final output', async () => {
  const f = await fixture();
  try {
    const run = await startCodex(f.request);
    const result = await run.result;
    assert.equal(result.status, 'completed');
    assert.equal(result.sessionId, '11111111-2222-4333-8444-555555555555');
    assert.equal(result.traceError, undefined);
    assert.ok(result.durationMs >= 0);
    const received = JSON.parse(await readFile(join(run.output, 'received.json'), 'utf8')) as {
      prompt: string;
      cwd: string;
      args: string[];
    };
    assert.equal(received.prompt, f.request.prompt);
    assert.equal(received.cwd, await realpath(f.request.cwd));
    assert.ok(received.args.includes('explicit-model'));
    assert.ok(received.args.includes('model_reasoning_effort=medium'));
    assert.equal(await readFile(join(run.output, 'prompt.md'), 'utf8'), f.request.prompt);
    assert.equal(await readFile(join(run.output, 'final.md'), 'utf8'), '完成🙂');
    assert.deepEqual(
      await readFile(join(run.output, 'rollout.jsonl')),
      await readFile(join(run.output, 'source-rollout.jsonl')),
    );
    const transcript = await writeTranscript(run.output);
    assert.deepEqual(transcript.errors, []);
    const text = await readFile(join(run.output, 'transcript.md'), 'utf8');
    assert.ok(text.includes('long output\\n'.repeat(10000)));
    assert.ok(text.includes('call-1') && text.includes('call-2'));
    assert.ok(text.includes('response-1') && text.includes('response-2'));
    assert.ok(text.includes('*** Begin Patch'));
    assert.ok(text.includes('完成🙂'));
    await appendFile(join(run.output, 'rollout.jsonl'), '{unfinished');
    const partial = await writeTranscript(run.output);
    assert.equal(partial.errors.length, 1);
    assert.ok((await readFile(join(run.output, 'rollout.jsonl'), 'utf8')).endsWith('{unfinished'));
  } finally {
    await f.cleanup();
  }
});

for (const scenario of ['cancel', 'force-cancel']) {
  void test(
    `${scenario}: stops the running CLI group and retains available trace`,
    { timeout: 15000 },
    async () => {
      const f = await fixture(scenario);
      const run = await startCodex(f.request);
      try {
        await waitFor(join(run.output, 'ready'));
        const result = await run.cancel();
        assert.equal(result.status, 'cancelled');
        assert.equal(result.traceError, undefined);
        assert.equal(await waitFor(join(run.output, 'descendant-stopped')), 'interrupted');
        assert.ok((await readFile(join(run.output, 'rollout.jsonl'), 'utf8')).includes('call-1'));
        assert.equal(result.signal, scenario === 'force-cancel' ? 'SIGKILL' : null);
        assert.deepEqual(await run.cancel(), result);
      } finally {
        await run.cancel();
        await f.cleanup();
      }
    },
  );
}

void test('retains failed execution and its rollout', async () => {
  const f = await fixture('fail');
  try {
    const run = await startCodex(f.request);
    const result = await run.result;
    assert.equal(result.status, 'failed');
    assert.equal(result.exitCode, 1);
    assert.equal(result.traceError, undefined);
    assert.equal(await readFile(join(run.output, 'stderr.log'), 'utf8'), 'fake CLI failed\n');
  } finally {
    await f.cleanup();
  }
});

void test('reports missing rollout without losing a completed execution', async () => {
  const f = await fixture('missing-rollout');
  try {
    const run = await startCodex(f.request);
    const result = await run.result;
    assert.equal(result.status, 'completed');
    assert.match(result.traceError ?? '', /No persisted rollout/);
    assert.equal(await readFile(join(run.output, 'final.md'), 'utf8'), '完成🙂');
  } finally {
    await f.cleanup();
  }
});

void test('records malformed events and keeps their raw bytes', async () => {
  const f = await fixture('malformed-event');
  try {
    const run = await startCodex(f.request);
    const result = await run.result;
    assert.equal(result.status, 'completed');
    assert.equal(result.eventErrors.length, 1);
    assert.ok((await readFile(join(run.output, 'events.jsonl'), 'utf8')).includes('not JSON\n'));
  } finally {
    await f.cleanup();
  }
});

void test('reports launch failure and still writes execution metadata', async () => {
  const f = await fixture();
  try {
    const run = await startCodex({ ...f.request, executable: join(f.root, 'no-such-cli') });
    const result = await run.result;
    assert.equal(result.status, 'failed');
    assert.ok(result.processError);
    assert.ok(result.traceError);
    const saved = JSON.parse(await readFile(join(run.output, 'result.json'), 'utf8')) as {
      status: string;
    };
    assert.equal(saved.status, 'failed');
  } finally {
    await f.cleanup();
  }
});

void test('the experiment runner prepares a task and exports the fake session end to end', async () => {
  const f = await fixture();
  try {
    const bin = join(f.root, 'bin');
    await mkdir(bin);
    await writeFile(
      join(bin, 'codex'),
      `#!${process.execPath}\nvoid import(${JSON.stringify(new URL('./fixtures/fake-codex.mjs', import.meta.url).href)});\n`,
      { mode: 0o755 },
    );
    const { stdout } = await promisify(execFile)(
      process.execPath,
      [new URL('./agent-authoring/run.ts', import.meta.url).pathname, '--output', f.request.output],
      { env: { ...process.env, ...f.request.env, PATH: bin + delimiter + process.env.PATH } },
    );
    const { output } = JSON.parse(stdout.split('\n')[0]) as { output: string };
    const result = JSON.parse(await readFile(join(output, 'result.json'), 'utf8')) as {
      status: string;
    };
    assert.equal(result.status, 'completed');
    const received = JSON.parse(await readFile(join(output, 'received.json'), 'utf8')) as {
      prompt: string;
    };
    assert.equal(
      received.prompt,
      await readFile(
        new URL('./agent-authoring/tasks/completable-future.md', import.meta.url),
        'utf8',
      ),
    );
    assert.ok((await readFile(join(output, 'environment.json'), 'utf8')).includes('fake-test'));
    assert.ok((await readFile(join(output, 'transcript.md'), 'utf8')).includes('call-2'));
    const launcher = await readFile(join(output, 'bin/paneon'), 'utf8');
    assert.ok(launcher.includes('/dist/cli/index.js'));
    const environment = JSON.parse(await readFile(join(output, 'environment.json'), 'utf8')) as {
      condition: string;
      skillProvided: boolean;
    };
    assert.equal(environment.condition, 'baseline');
    assert.equal(environment.skillProvided, false);
    await assert.rejects(readFile(join(output, 'workspace/AGENTS.md')), { code: 'ENOENT' });
  } finally {
    await f.cleanup();
  }
});

for (const condition of ['baseline', 'available', 'forced']) {
  void test(`${condition}: keeps the natural task body and controls skill exposure independently`, async () => {
    const f = await fixture();
    try {
      const skillDirectory = join(f.root, 'provided-skill');
      await mkdir(skillDirectory);
      await writeFile(join(skillDirectory, 'SKILL.md'), 'test skill description');
      const task = new URL('./agent-authoring/tasks/completable-future.md', import.meta.url)
        .pathname;
      const body = await readFile(task, 'utf8');
      const experiment = await prepareExperiment({
        task,
        repository: process.cwd(),
        output: f.request.output,
        skillDirectory,
        provideSkill: condition === 'available',
        invokeSkill: condition === 'forced',
      });
      assert.equal(experiment.condition, condition);
      assert.equal(
        experiment.prompt,
        condition === 'forced' ? `${skillInvocation}\n\n${body}` : body,
      );
      assert.ok(experiment.skillConfig.includes('name="paneon-visualize",enabled=false'));
      await assert.rejects(readFile(join(experiment.cwd, 'AGENTS.md')), { code: 'ENOENT' });
      await assert.rejects(
        readFile(join(experiment.cwd, '.agents/skills/paneon-visualize/SKILL.md')),
        { code: 'ENOENT' },
      );
      if (condition === 'baseline') {
        assert.equal(experiment.provided, false);
        assert.ok(!experiment.skillConfig.includes('enabled=true'));
        await assert.rejects(readFile(join(experiment.output, 'skill-snapshot/SKILL.md')), {
          code: 'ENOENT',
        });
      } else {
        assert.equal(experiment.provided, true);
        assert.ok(experiment.skillConfig.includes('enabled=true'));
        assert.ok(experiment.skillConfig.includes(join(skillDirectory, 'SKILL.md')));
        assert.equal(
          await readFile(join(experiment.output, 'skill-snapshot/SKILL.md'), 'utf8'),
          'test skill description',
        );
      }
    } finally {
      await f.cleanup();
    }
  });
}

void test('an invocation already at the start of the task provides the skill without duplicating the prefix', async () => {
  const f = await fixture();
  try {
    const skillDirectory = join(f.root, 'provided-skill');
    await mkdir(skillDirectory);
    await writeFile(join(skillDirectory, 'SKILL.md'), 'test skill');
    const task = join(f.root, 'task.md');
    const prompt = `${skillInvocation}\n\n给我讲讲 CompletableFuture。\n`;
    await writeFile(task, prompt);
    const experiment = await prepareExperiment({
      task,
      output: f.request.output,
      repository: process.cwd(),
      skillDirectory,
    });
    assert.equal(experiment.condition, 'forced');
    assert.equal(experiment.provided, true);
    assert.equal(experiment.prompt, prompt);
  } finally {
    await f.cleanup();
  }
});
