#!/usr/bin/env node
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
const { diagnosticLocation, debugDiagnostic } = (await import(
  import.meta.url.endsWith('.ts')
    ? new URL('./diagnostics.ts', import.meta.url).href
    : './diagnostics.js'
)) as typeof import('./diagnostics.js');
import type { Diagnostic } from '../shared/types.js';
import { Command, Option, CommanderError } from 'commander';
const packageJson = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
) as { version: string };
const program = new Command();
program
  .name('paneon')
  .description('Let agents build interactive local pages and bring your feedback back.')
  .version(packageJson.version)
  .option('--debug', 'Write framework diagnostics to stderr')
  .option('--json', 'Print a machine-readable JSON result')
  .addHelpText(
    'after',
    '\nJSON output:\n  --json prints one envelope: {"ok":true,"data":...} or {"ok":false,"error":{"code","message","details"?}}.\n  Failures exit with 1; empty reads and wait timeouts succeed.',
  )
  .exitOverride();
const panel = program.command('panel').description('Run and manage interactive panel instances');
const server = program
  .command('server')
  .description('Start, inspect, and stop the local Paneon service');
for (const group of [panel, server])
  group
    .option('--debug', 'Write framework diagnostics to stderr')
    .option('--json', 'Print a machine-readable JSON result');
async function client(): Promise<typeof import('./client.js')> {
  const path = import.meta.url.endsWith('.ts')
    ? new URL('../../dist/cli/client.js', import.meta.url).href
    : './client.js';
  return import(path) as Promise<typeof import('./client.js')>;
}

function execute(command: Command, action: () => Promise<unknown>) {
  command
    .option('--json', 'Print a machine-readable JSON result')
    .option('--debug', 'Write framework diagnostics to stderr')
    .action(async () => {
      const debug = Boolean(command.optsWithGlobals().debug);
      const started = Date.now();
      if (debug) process.stderr.write('[debug] command.start\n');
      try {
        const data = await action();
        if (debug && data && typeof data === 'object' && 'diagnostic' in data)
          process.stderr.write(debugDiagnostic(data.diagnostic));
        process.stdout.write(
          command.optsWithGlobals().json
            ? JSON.stringify({ ok: true, data }) + '\n'
            : JSON.stringify(data, null, 2) + '\n',
        );
        if (debug)
          process.stderr.write(`[debug] command.complete elapsedMs=${Date.now() - started}\n`);
      } catch (error) {
        fail(error, command.optsWithGlobals().json, debug);
      }
    });
}
function invalid(message: string): never {
  throw Object.assign(new Error(message), { code: 'INVALID_ARGUMENT' });
}
function integer(value: string | undefined, min: number, max: number, fallback?: number) {
  if (value === undefined && fallback !== undefined) return fallback;
  const n = Number(value);
  if (!value || !/^\d+$/.test(value) || !Number.isSafeInteger(n) || n < min || n > max)
    invalid(`Expected an integer between ${min} and ${max}.`);
  return n;
}
const init = program
  .command('init')
  .description('Install the bundled Paneon skill for your agents')
  .option('--agent <agents...>', 'Agent IDs to install to (see init --help)')
  .option('--project', 'Install to the current project (default)')
  .option('--global', 'Install to your user-level agent directories')
  .option('--copy', 'Copy to all selected agents instead of using symlinks')
  .option('--yes', 'Skip prompts and install using supplied options and defaults')
  .addHelpText(
    'after',
    '\nAgents: codex, cursor, claude-code, opencode, gemini-cli, github-copilot, cline, windsurf, qwen-code, kiro-cli, roo\n\n--json requires --yes. Installing replaces existing paneon skill directories, discarding local edits without backup.\n\nExamples:\n  paneon init\n  paneon init --agent codex claude-code --project --yes --json\n  paneon init --agent claude-code --global --copy --yes --json',
  );
execute(init, async () => {
  const path = import.meta.url.endsWith('.ts')
    ? new URL('../../dist/cli/init.js', import.meta.url).href
    : './init.js';
  const { runInit } = (await import(path)) as typeof import('./init.js');
  return runInit(init.optsWithGlobals());
});
const run = panel
  .command('run <entry.tsx>')
  .description('Create a new panel instance and print its browser URL')
  .requiredOption('--cwd <directory>', 'Working directory for local panel functions')
  .option('--params <json>', 'Panel input matching its schema (defaults to {})')
  .option('--params-file <path>', 'Read panel input from a UTF-8 JSON file instead of --params')
  .addOption(new Option('--watch', 'Automatically reload source changes (default)'))
  .addOption(new Option('--no-watch', 'Disable automatic source reload'))
  .option('--open', 'Open the panel in the system browser')
  .addHelpText(
    'after',
    '\nRelative entry and --params-file paths resolve against the current directory, not --cwd.',
  );
execute(run, async () => {
  if (process.argv.includes('--watch') && process.argv.includes('--no-watch'))
    invalid('--watch and --no-watch cannot be used together.');
  const options = run.opts<{
    cwd: string;
    params?: string;
    paramsFile?: string;
    watch?: boolean;
    open?: boolean;
  }>();
  if (options.params !== undefined && options.paramsFile !== undefined)
    invalid('--params and --params-file cannot be used together.');
  const entryPath = resolve(run.args[0]);
  const cwd = resolve(options.cwd);
  try {
    if (!statSync(entryPath).isFile() || !statSync(cwd).isDirectory())
      invalid('The entry must be a file and cwd must be a directory.');
  } catch {
    invalid('The entry and cwd must exist and be accessible.');
  }
  let input = options.params ?? '{}';
  if (options.paramsFile !== undefined) {
    try {
      input = readFileSync(resolve(options.paramsFile), 'utf8');
    } catch {
      invalid('--params-file must name a readable UTF-8 JSON file.');
    }
  }
  let params: unknown;
  try {
    params = JSON.parse(input);
  } catch {
    invalid(
      `${options.paramsFile !== undefined ? '--params-file' : '--params'} must contain valid JSON.`,
    );
  }
  const result = await (
    await client()
  ).call('/api/panels', {
    method: 'POST',
    body: { entryPath, cwd, params, watch: options.watch !== false },
    start: true,
  });
  if (options.open) {
    const url = (result as { url: string }).url;
    const opener = spawn(
      process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open',
      process.platform === 'win32' ? ['/c', 'start', '', url] : [url],
      { stdio: 'ignore' },
    );
    opener.unref();
    opener.once('error', () =>
      process.stderr.write('Warning: The browser could not be opened. Use the returned URL.\n'),
    );
  }
  return result;
});
const list = panel
  .command('list')
  .description('List a page of stored panel instances')
  .addOption(
    new Option('--status <status>', 'Filter by panel status').choices([
      'running',
      'closed',
      'unavailable',
    ]),
  )
  .option('--page <number>', 'Page number, starting at 1', '1')
  .option('--page-size <count>', 'Instances per page, 1–1000', '20');
execute(list, async () => {
  const options = list.opts<{ page: string; pageSize: string; status?: string }>();
  const query = new URLSearchParams({
    page: String(integer(options.page, 1, 2147483647)),
    pageSize: String(integer(options.pageSize, 1, 1000)),
  });
  if (options.status !== undefined) query.set('status', options.status);
  return (await client()).call(`/api/panels?${query}`);
});
for (const name of ['inspect', 'reload', 'close'] as const) {
  const command = panel
    .command(`${name} <instance-id>`)
    .description(
      name === 'inspect'
        ? 'Inspect complete panel details and its current URL'
        : name === 'reload'
          ? 'Reload the current source without changing watch mode; a closed instance needs a new panel run'
          : 'Close panel runtime resources and preserve interaction history',
    );
  execute(command, async () => {
    const path = `/api/panels/${encodeURIComponent(command.args[0])}`;
    const result = await (
      await client()
    ).call(name === 'inspect' ? path : `${path}/${name}`, {
      method: name === 'inspect' ? 'GET' : 'POST',
    });
    if (name === 'inspect' && result && typeof result === 'object' && !Array.isArray(result)) {
      const { manifest: _, ...details } = result;
      return details;
    }
    return result;
  });
}
const deletePanel = panel
  .command('delete <instance-id>')
  .description('Stop a panel and permanently delete its instance, events and consumer positions');
execute(deletePanel, async () =>
  (await client()).call(`/api/panels/${encodeURIComponent(deletePanel.args[0])}`, {
    method: 'DELETE',
  }),
);
const events = panel
  .command('events <instance-id>')
  .description('Read unacknowledged interaction events without acknowledging them')
  .requiredOption('--consumer <name>', 'Persistent consumer name')
  .option('--wait-ms <ms>', 'Maximum wait in milliseconds, 0–60000', '0')
  .option('--limit <count>', 'Maximum events, 1–1000', '100')
  .addHelpText(
    'after',
    '\nResult: events[] with id, type, payload and createdAt; hasMore means more events are waiting; timedOut means the wait ended without events.\nDelivery is at least once: unacknowledged events are delivered again. A consumer name keeps its position across processes and sessions.',
  );
execute(events, async () => {
  const o = events.opts<{ consumer: string; waitMs: string; limit: string }>();
  if (!o.consumer.trim()) invalid('The consumer name must not be empty.');
  return (await client()).call(
    `/api/panels/${encodeURIComponent(events.args[0])}/events?${new URLSearchParams({ consumer: o.consumer, waitMs: String(integer(o.waitMs, 0, 60000)), limit: String(integer(o.limit, 1, 1000)) })}`,
  );
});
const ack = panel
  .command('ack <instance-id>')
  .description('Acknowledge events already handled by this consumer')
  .requiredOption('--consumer <name>', 'Persistent consumer name')
  .requiredOption(
    '--through <event-id>',
    'Acknowledge every delivered event up to and including this ID',
  );
execute(ack, async () => {
  const o = ack.opts<{ consumer: string; through: string }>();
  if (!o.consumer.trim()) invalid('The consumer name must not be empty.');
  return (await client()).call(`/api/panels/${encodeURIComponent(ack.args[0])}/acks`, {
    method: 'POST',
    body: {
      consumer: o.consumer,
      through: integer(o.through, 1, Number.MAX_SAFE_INTEGER),
    },
  });
});
const config = program.command('config').description('Read and update user interface preferences');
const configGet = config.command('get').description('Read effective UI preferences');
execute(configGet, async () => {
  const path = import.meta.url.endsWith('.ts')
    ? new URL('../../dist/cli/config.js', import.meta.url).href
    : './config.js';
  const { getConfig } = (await import(path)) as typeof import('./config.js');
  return getConfig();
});
const configSet = config
  .command('set <key> <value>')
  .description('Set ui.theme (light/dark) or ui.language (en/zh-CN)');
execute(configSet, async () => {
  const path = import.meta.url.endsWith('.ts')
    ? new URL('../../dist/cli/config.js', import.meta.url).href
    : './config.js';
  const { setConfig } = (await import(path)) as typeof import('./config.js');
  return setConfig(configSet.args[0], configSet.args[1]);
});
const start = server.command('start').description('Start the service if it is not already running');
execute(start, async () => {
  const runtimeClient = await client();
  await runtimeClient.ensureRuntime();
  return runtimeClient.serverStatus();
});
const status = server.command('status').description('Check the service without starting it');
execute(status, async () => (await client()).serverStatus());
const stop = server
  .command('stop')
  .description('Stop the service and preserve stored panel history');
execute(stop, async () => (await client()).stopServer());
const logs = server
  .command('logs')
  .description('Read retained service logs without starting the service')
  .option('--tail <count>', 'Newest matching records (1–10000)', '100')
  .addOption(
    new Option('--level <level>', 'Minimum log level').choices([
      'debug',
      'info',
      'warn',
      'error',
      'fatal',
    ]),
  )
  .option('--instance <instance-id>', 'Filter by instance context')
  .option('--runtime <runtime-id>', 'Filter by runtime context')
  .option('--follow', 'Follow appended records, rotation, and restarts')
  .option('--json', 'Print JSON (one envelope per event when following)')
  .option('--debug', 'Write command diagnostics to stderr');
logs.action(async () => {
  const options = logs.optsWithGlobals<{
    tail: string;
    level?: 'debug' | 'info' | 'warn' | 'error' | 'fatal';
    instance?: string;
    runtime?: string;
    follow?: boolean;
    json?: boolean;
    debug?: boolean;
  }>();
  try {
    const path = import.meta.url.endsWith('.ts')
      ? new URL('../../dist/cli/logs.js', import.meta.url).href
      : './logs.js';
    const { printLogs } = (await import(path)) as typeof import('./logs.js');
    const { interrupted } = await printLogs({
      ...options,
      tail: integer(options.tail, 1, 10000),
      follow: Boolean(options.follow),
      json: Boolean(options.json),
      debug: Boolean(options.debug),
    });
    // Explicit cancellation discards pending output; an unread pipe must not
    // keep this reader process alive after its file handles have closed.
    if (interrupted) process.exit(0);
  } catch (err) {
    fail(err, options.json);
  }
});
function fail(error: unknown, json: unknown, debug = false) {
  const e = error as { code?: string; message?: string; details?: unknown };
  const code =
    typeof e.code === 'string' && !e.code.startsWith('commander.') ? e.code : 'INVALID_ARGUMENT';
  const message = typeof e.message === 'string' ? e.message : 'The command failed.';
  if (json)
    process.stdout.write(
      JSON.stringify({
        ok: false,
        error: { code, message, ...(e.details ? { details: e.details } : {}) },
      }) + '\n',
    );
  else {
    const location = diagnosticLocation(e as Diagnostic);
    process.stderr.write(message + (location ? `\n${location}` : '') + '\n');
  }
  if (debug) process.stderr.write(debugDiagnostic(e));
  process.exitCode = 1;
}
try {
  await program.parseAsync();
} catch (error) {
  if (
    error instanceof CommanderError &&
    (error.code === 'commander.helpDisplayed' || error.code === 'commander.version')
  ) {
    /* successful built-in output */
  } else fail(error, process.argv.includes('--json'), process.argv.includes('--debug'));
}
