import { spawn } from 'node:child_process';
import { copyFile, mkdir, open, readFile, readdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import type { Writable } from 'node:stream';

export type CodexRequest = {
  prompt: string;
  cwd: string;
  output: string;
  model?: string;
  config?: string[];
  addDirs?: string[];
  env?: NodeJS.ProcessEnv;
  executable?: string;
  executableArgs?: string[];
};

type Event = {
  type: string;
  thread_id?: string;
  usage?: unknown;
};

export type CodexResult = {
  status: 'completed' | 'failed' | 'cancelled';
  startedAt: string;
  endedAt: string;
  durationMs: number;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  sessionId?: string;
  usage?: unknown;
  processError?: string;
  eventErrors: { line: number; error: string }[];
  rolloutPath?: string;
  traceError?: string;
};

/** Read the persisted session by its exact ID, never by "latest session". */
async function copyRollout(codexHome: string, sessionId: string, output: string) {
  const entries = await readdir(join(codexHome, 'sessions'), {
    recursive: true,
    withFileTypes: true,
  });
  const entry = entries.find(
    (entry) => entry.isFile() && entry.name.endsWith(`-${sessionId}.jsonl`),
  );
  if (!entry) throw new Error(`No persisted rollout found for session ${sessionId}.`);
  const path = join(entry.parentPath, entry.name);
  await copyFile(path, join(output, 'rollout.jsonl'));
  return path;
}

/** Start one real CLI session. No model is called merely by importing this module. */
export async function startCodex(request: CodexRequest) {
  const cwd = resolve(request.cwd);
  const output = resolve(request.output);
  const env = { ...process.env, ...request.env };
  const codexHome = env.CODEX_HOME ?? join(homedir(), '.codex');
  await mkdir(output, { recursive: true });
  await writeFile(join(output, 'prompt.md'), request.prompt);
  const stdout = await open(join(output, 'events.jsonl'), 'w');
  const stderr = await open(join(output, 'stderr.log'), 'w');
  const executable = request.executable ?? 'codex';
  const args = [
    ...(request.executableArgs ?? []),
    'exec',
    '--json',
    '--skip-git-repo-check',
    '--sandbox',
    'workspace-write',
    '--cd',
    cwd,
    '--output-last-message',
    join(output, 'final.md'),
  ];
  if (request.model !== undefined) args.push('--model', request.model);
  for (const config of request.config ?? []) args.push('-c', config);
  for (const directory of request.addDirs ?? []) args.push('--add-dir', directory);
  args.push('-');

  const startedAt = new Date().toISOString();
  const started = performance.now();
  const child = spawn(executable, args, {
    cwd,
    env,
    detached: true,
    stdio: ['pipe', stdout.fd, stderr.fd],
  });
  let processError: string | undefined;
  child.on('error', (error) => {
    processError = error.message;
  });
  const stdin = child.stdin as Writable; // stdio[0] is explicitly a pipe.
  stdin.on('error', (error: NodeJS.ErrnoException) => {
    // A CLI that fails before reading stdin can close the pipe first.
    processError ??= `${error.code}: ${error.message}`;
  });
  const closed = new Promise<{
    exitCode: number | null;
    signal: NodeJS.Signals | null;
    endedAt: string;
    durationMs: number;
  }>((done) => {
    child.once('close', (exitCode, signal) => {
      done({
        exitCode,
        signal,
        endedAt: new Date().toISOString(),
        durationMs: Math.round(performance.now() - started),
      });
    });
  });
  stdin.end(request.prompt);
  let cancelled = false;

  const result = (async (): Promise<CodexResult> => {
    try {
      await writeFile(
        join(output, 'run.json'),
        JSON.stringify({ executable, args, cwd, codexHome, pid: child.pid, startedAt }, null, 2),
      );
      const ending = await closed;
      await Promise.all([stdout.close(), stderr.close()]);
      const eventErrors: CodexResult['eventErrors'] = [];
      const events: Event[] = [];
      const lines = (await readFile(join(output, 'events.jsonl'), 'utf8')).split('\n');
      for (const [index, line] of lines.entries()) {
        if (!line.trim()) continue;
        try {
          events.push(JSON.parse(line) as Event);
        } catch (error) {
          eventErrors.push({ line: index + 1, error: String(error) });
        }
      }
      const sessionId = events.find((event) => event.type === 'thread.started')?.thread_id;
      const completed = events.findLast((event) => event.type === 'turn.completed');
      const outcome: CodexResult = {
        status: cancelled
          ? 'cancelled'
          : ending.exitCode === 0 && completed
            ? 'completed'
            : 'failed',
        startedAt,
        ...ending,
        sessionId,
        usage: completed?.usage,
        processError,
        eventErrors,
      };
      try {
        if (!sessionId) throw new Error('No thread.started event; no session ID to export.');
        outcome.rolloutPath = await copyRollout(codexHome, sessionId, output);
      } catch (error) {
        // Preserve the execution result even when trace export itself fails.
        outcome.traceError = String(error);
      }
      await writeFile(join(output, 'result.json'), JSON.stringify(outcome, null, 2));
      return outcome;
    } catch (error) {
      signalGroup('SIGKILL');
      await closed;
      await Promise.all([stdout.close(), stderr.close()]);
      throw error;
    }
  })();

  function signalGroup(signal: NodeJS.Signals) {
    if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
    try {
      process.kill(-child.pid, signal);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
    }
  }

  async function cancel() {
    if (child.exitCode !== null || child.signalCode !== null) return result;
    cancelled = true;
    signalGroup('SIGINT');
    let timer: NodeJS.Timeout | undefined;
    try {
      const exited = await Promise.race([
        closed.then(() => true),
        new Promise<false>((done) => {
          timer = setTimeout(() => done(false), 5000);
        }),
      ]);
      if (!exited) signalGroup('SIGKILL');
      return await result;
    } finally {
      clearTimeout(timer);
    }
  }

  return { pid: child.pid, output, result, cancel };
}
