import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { parseArgs, promisify } from 'node:util';
import { startCodex } from './codex.ts';
import { writeTranscript } from './trace.ts';
import { prepareExperiment } from './experiment.ts';

const repository = resolve(import.meta.dirname, '../..');
const { values } = parseArgs({
  options: {
    task: { type: 'string', default: join(import.meta.dirname, 'tasks/completable-future.md') },
    output: { type: 'string', default: '/tmp/paneon-exp/runs' },
    skill: { type: 'boolean' },
    'invoke-skill': { type: 'boolean' },
    model: { type: 'string' },
    config: { type: 'string', multiple: true, default: [] },
    help: { type: 'boolean' },
  },
});

if (values.help) {
  console.log(`Run only after the task has been reviewed and approved.
node tests/agent-authoring/run.ts [--task prompt.md] [--output directory]
  [--skill | --invoke-skill] [--model model] [--config key=value ...]

Default: no skill is provided and the task is sent unchanged.
--skill: provide the skill without naming it in the prompt.
--invoke-skill: provide the skill and prepend its explicit invocation.
By default, each invocation uses a fresh workspace outside the repository.
Ctrl+C cancels Codex and exports the available trace.`);
} else {
  const task = resolve(values.task);
  const experiment = await prepareExperiment({
    task,
    output: values.output,
    repository,
    provideSkill: values.skill,
    invokeSkill: values['invoke-skill'],
  });
  const { output, cwd, bin, prompt } = experiment;
  const execute = promisify(execFile);
  const [{ stdout: codexVersion }, { stdout: revision }, packageText] = await Promise.all([
    execute('codex', ['--version']),
    execute('git', ['rev-parse', 'HEAD'], { cwd: repository }),
    readFile(join(repository, 'package.json'), 'utf8'),
  ]);
  await writeFile(
    join(output, 'environment.json'),
    JSON.stringify(
      {
        task,
        repository,
        revision: revision.trim(),
        codexVersion: codexVersion.trim(),
        paneonVersion: (JSON.parse(packageText) as { version: string }).version,
        condition: experiment.condition,
        skillProvided: experiment.provided,
        skillInvoked: experiment.invoked,
        skillDirectory: experiment.provided ? experiment.skillDirectory : undefined,
        skillConfig: experiment.skillConfig,
        note: 'Model, global instructions and tools are inherited. skills.config is overridden for this invocation only.',
      },
      null,
      2,
    ),
  );
  const runtimeHome = join(homedir(), '.paneon');
  await mkdir(runtimeHome, { recursive: true });
  const run = await startCodex({
    prompt,
    cwd,
    output,
    model: values.model,
    config: [
      'sandbox_workspace_write.network_access=true',
      experiment.skillConfig,
      ...values.config,
    ],
    addDirs: [runtimeHome],
    env: { PATH: bin + delimiter + process.env.PATH },
  });
  console.log(JSON.stringify({ output, pid: run.pid }));
  let cancelling: Promise<unknown> | undefined;
  const cancel = () => {
    cancelling ??= run.cancel().catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    });
  };
  process.on('SIGINT', cancel);
  process.on('SIGTERM', cancel);
  try {
    const result = await run.result;
    if (result.rolloutPath) await writeTranscript(output);
    console.log(JSON.stringify(result, null, 2));
    if (result.status !== 'completed') process.exitCode = result.status === 'cancelled' ? 130 : 1;
    if (result.traceError) console.error(result.traceError);
    await cancelling;
  } finally {
    process.off('SIGINT', cancel);
    process.off('SIGTERM', cancel);
  }
}
