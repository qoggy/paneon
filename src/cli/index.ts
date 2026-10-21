#!/usr/bin/env node
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { Command, Option, CommanderError } from 'commander';
const packageJson = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
) as { version: string };
const program = new Command();
program
  .name('paneon')
  .description('Code-first interactive interfaces for agents.')
  .version(packageJson.version)
  .option('--debug', 'Write framework diagnostics to stderr')
  .option('--json', 'Print a machine-readable JSON result')
  .exitOverride();
const panel = program.command('panel').description('Run and manage interactive panel instances');
const server = program.command('server').description('Inspect and stop the local Paneon service');
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
        process.stdout.write(
          command.optsWithGlobals().json
            ? JSON.stringify({ ok: true, data }) + '\n'
            : JSON.stringify(data, null, 2) + '\n',
        );
        if (debug)
          process.stderr.write(`[debug] command.complete elapsedMs=${Date.now() - started}\n`);
      } catch (error) {
        fail(error, command.optsWithGlobals().json);
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
const run = panel
  .command('run <entry.tsx>')
  .description('Create a new panel instance and print its browser URL')
  .requiredOption('--cwd <directory>', 'Working directory for local panel functions')
  .requiredOption('--params <json>', 'Panel input matching its schema')
  .addOption(new Option('--watch', 'Automatically reload source changes (default)'))
  .addOption(new Option('--no-watch', 'Disable automatic source reload'))
  .option('--open', 'Open the panel in the system browser');
execute(run, async () => {
  if (process.argv.includes('--watch') && process.argv.includes('--no-watch'))
    invalid('--watch and --no-watch cannot be used together.');
  const options = run.opts<{ cwd: string; params: string; watch?: boolean; open?: boolean }>();
  const entryPath = resolve(run.args[0]);
  const cwd = resolve(options.cwd);
  try {
    if (!statSync(entryPath).isFile() || !statSync(cwd).isDirectory())
      invalid('The entry must be a file and cwd must be a directory.');
  } catch {
    invalid('The entry and cwd must exist and be accessible.');
  }
  let params: unknown;
  try {
    params = JSON.parse(options.params);
  } catch {
    invalid('--params must be valid JSON.');
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
  .option('--page <number>', 'Page number, starting at 1', '1')
  .option('--page-size <count>', 'Instances per page, 1–1000', '20');
execute(list, async () => {
  const options = list.opts<{ page: string; pageSize: string }>();
  const query = new URLSearchParams({
    page: String(integer(options.page, 1, 2147483647)),
    pageSize: String(integer(options.pageSize, 1, 1000)),
  });
  return (await client()).call(`/api/panels?${query}`);
});
for (const name of ['inspect', 'reload', 'close'] as const) {
  const command = panel
    .command(`${name} <instance-id>`)
    .description(
      name === 'inspect'
        ? 'Inspect complete panel details and its current URL'
        : name === 'reload'
          ? 'Reload the current source without changing watch mode'
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
const events = panel
  .command('events <instance-id>')
  .description('Read unacknowledged interaction events without acknowledging them')
  .requiredOption('--consumer <name>', 'Persistent consumer name')
  .option('--wait-ms <ms>', 'Maximum wait in milliseconds, 0–60000', '0')
  .option('--limit <count>', 'Maximum events, 1–1000', '100');
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
  .requiredOption('--through <event-id>', 'Acknowledge through this delivered event');
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
const status = server.command('status').description('Check the service without starting it');
execute(status, async () => (await client()).serverStatus());
const stop = server
  .command('stop')
  .description('Stop the service and preserve stored panel history');
execute(stop, async () => (await client()).stopServer());
function fail(error: unknown, json: unknown) {
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
  else process.stderr.write(message + '\n');
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
  } else fail(error, process.argv.includes('--json'));
}
