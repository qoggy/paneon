import { open } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { join } from 'node:path';
import { PANEON_HOME } from '../shared/paths.js';
import { logFiles, LOG_LEVELS, LOG_RECORD_BYTES } from '../runtime/logging.js';
import type { LogFile } from '../runtime/logging.js';

export type LogRecord = {
  schemaVersion: number;
  time: string;
  level: number;
  msg: string;
  runtimeId: string;
  instanceId?: string;
  err?: unknown;
  [key: string]: unknown;
};
export type LogOptions = {
  tail: number;
  level?: keyof typeof LOG_LEVELS;
  instance?: string;
  runtime?: string;
};
export type LogResult = {
  records: LogRecord[];
  files: string[];
  truncated: boolean;
  warnings: string[];
};
export type LogEvent =
  { type: 'record'; record: LogRecord } | { type: 'warning'; code: string; message: string };
const OUTPUT_BYTES = 4 * 1024 * 1024;
type Cursor = { handle: FileHandle; offset: number; pending: Buffer; file: LogFile };
function ordered(files: LogFile[]) {
  const times = new Map<string, number>();
  for (const f of files) times.set(f.runtimeId, Math.max(times.get(f.runtimeId) ?? 0, f.modified));
  return files.sort(
    (a, b) =>
      (times.get(a.runtimeId) ?? 0) - (times.get(b.runtimeId) ?? 0) ||
      a.runtimeId.localeCompare(b.runtimeId) ||
      b.archive - a.archive,
  );
}
class Reader {
  cursors = new Map<string, Cursor>();
  files = new Set<string>();
  directory: string;
  constructor(directory: string) {
    this.directory = directory;
  }
  async scan() {
    this.files.clear();
    for (const file of ordered(logFiles(this.directory))) {
      this.files.add(file.name);
      if (this.cursors.has(file.identity)) continue;
      let handle: FileHandle;
      try {
        handle = await open(file.path, 'r');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        process.stderr.write(
          `[warning] Log file rotated before it could be opened: ${file.name}\n`,
        );
        continue;
      }
      const stat = await handle.stat();
      const identity = `${stat.dev}:${stat.ino}`;
      if (this.cursors.has(identity)) await handle.close();
      else this.cursors.set(identity, { handle, offset: 0, pending: Buffer.alloc(0), file });
    }
  }
  async *records(): AsyncGenerator<LogEvent, void, unknown> {
    for (const [identity, cursor] of this.cursors) {
      const buffer = Buffer.alloc(64 * 1024);
      while (true) {
        const { bytesRead } = await cursor.handle.read(buffer, 0, buffer.length, cursor.offset);
        if (!bytesRead) break;
        cursor.offset += bytesRead;
        cursor.pending = Buffer.concat([cursor.pending, buffer.subarray(0, bytesRead)]);
        let newline: number;
        while ((newline = cursor.pending.indexOf(10)) !== -1) {
          const line = cursor.pending.subarray(0, newline);
          cursor.pending = cursor.pending.subarray(newline + 1);
          if (line.length > LOG_RECORD_BYTES)
            throw new Error(`Log record exceeds 64 KiB: ${cursor.file.name}`);
          const record = JSON.parse(line.toString('utf8')) as LogRecord;
          if (record.schemaVersion !== 1)
            throw new Error(`Unsupported log schema in ${cursor.file.name}.`);
          yield { type: 'record', record };
        }
        if (cursor.pending.length > LOG_RECORD_BYTES)
          throw new Error(`Log record exceeds 64 KiB: ${cursor.file.name}`);
      }
      if ((await cursor.handle.stat()).nlink === 0) {
        yield {
          type: 'warning',
          code: 'LOG_RETENTION_GAP',
          message: `${cursor.file.name} was removed by retention; records produced between scans may be missing.`,
        };
        await cursor.handle.close();
        this.cursors.delete(identity);
      }
    }
  }
  async close() {
    for (const cursor of this.cursors.values()) await cursor.handle.close();
    this.cursors.clear();
  }
}
function matches(record: LogRecord, options: LogOptions) {
  return (
    record.level >= (options.level ? LOG_LEVELS[options.level] : 0) &&
    (!options.instance || record.instanceId === options.instance) &&
    (!options.runtime || record.runtimeId === options.runtime)
  );
}
async function snapshot(
  reader: Reader,
  options: LogOptions,
  warnPartial: boolean,
): Promise<LogResult> {
  const result: LogResult = { records: [], files: [], truncated: false, warnings: [] };
  let bytes = 0;
  await reader.scan();
  for await (const event of reader.records()) {
    if (event.type === 'warning') {
      result.warnings.push(event.message);
      continue;
    }
    if (!matches(event.record, options)) continue;
    result.records.push(event.record);
    bytes += Buffer.byteLength(JSON.stringify(event.record)) + 1;
    while (result.records.length > options.tail || bytes > OUTPUT_BYTES - 16384) {
      bytes -= Buffer.byteLength(JSON.stringify(result.records.shift())) + 1;
      result.truncated = true;
    }
  }
  result.files = [...reader.files];
  if (warnPartial)
    for (const cursor of reader.cursors.values()) {
      if (cursor.pending.length)
        result.warnings.push(`Incomplete final record ignored: ${cursor.file.name}`);
    }
  return result;
}
export async function readLogs(options: LogOptions, home = PANEON_HOME): Promise<LogResult> {
  const reader = new Reader(join(home, 'logs'));
  try {
    return await snapshot(reader, options, true);
  } finally {
    await reader.close();
  }
}
function pause(signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', finish);
      resolve();
    };
    const timer = setTimeout(finish, 250);
    signal.addEventListener('abort', finish, { once: true });
  });
}
export async function* followLogs(
  options: LogOptions,
  signal: AbortSignal,
  home = PANEON_HOME,
): AsyncGenerator<LogEvent, void, unknown> {
  const reader = new Reader(join(home, 'logs'));
  try {
    const initial = await snapshot(reader, options, false);
    for (const record of initial.records) {
      if (signal.aborted) return;
      yield { type: 'record', record };
    }
    if (initial.truncated)
      yield {
        type: 'warning',
        code: 'LOG_TAIL_TRUNCATED',
        message: 'Only the requested bounded log tail is shown.',
      };
    for (const message of initial.warnings)
      yield { type: 'warning', code: 'LOG_READ_WARNING', message };
    while (!signal.aborted) {
      await reader.scan();
      for await (const event of reader.records()) {
        if (signal.aborted) return;
        if (event.type === 'warning' || matches(event.record, options)) yield event;
      }
      await pause(signal);
    }
  } finally {
    await reader.close();
  }
}
function formatError(error: unknown): string {
  if (!error || typeof error !== 'object') return String(error);
  const e = error as {
    type?: string;
    message?: string;
    stack?: string;
    cause?: unknown;
    code?: unknown;
    truncated?: boolean;
  };
  return `${e.stack ?? `${e.type ?? 'Error'}: ${e.message ?? ''}`}${e.code === undefined ? '' : ` [${JSON.stringify(e.code)}]`}${e.truncated ? ' [truncated]' : ''}${e.cause === undefined ? '' : `\nCaused by: ${formatError(e.cause)}`}`;
}
export function formatRecord(record: LogRecord) {
  const level =
    Object.entries(LOG_LEVELS).find(([, value]) => value === record.level)?.[0] ??
    String(record.level);
  const { time, msg, level: _, err, ...context } = record;
  return `${time} ${level.toUpperCase()} ${msg}\n${JSON.stringify(context)}\n${err === undefined ? '' : formatError(err) + '\n'}`;
}
async function output(text: string, signal: AbortSignal) {
  if (signal.aborted || process.stdout.write(text)) return;
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      process.stdout.off('drain', drained);
      process.stdout.off('error', failed);
      signal.removeEventListener('abort', drained);
    };
    const drained = () => {
      cleanup();
      resolve();
    };
    const failed = (error: Error) => {
      cleanup();
      reject(error);
    };
    process.stdout.once('drain', drained);
    process.stdout.once('error', failed);
    signal.addEventListener('abort', drained, { once: true });
  });
}
export async function printLogs(
  options: LogOptions & { follow: boolean; json: boolean; debug: boolean },
) {
  const controller = new AbortController();
  const stop = () => controller.abort();
  if (options.debug) process.stderr.write('[debug] command.start\n');
  if (!options.follow) {
    const result = await readLogs(options);
    if (options.json) process.stdout.write(JSON.stringify({ ok: true, data: result }) + '\n');
    else {
      for (const record of result.records) await output(formatRecord(record), controller.signal);
      for (const warning of result.warnings) process.stderr.write(`[warning] ${warning}\n`);
      if (result.truncated)
        process.stderr.write('[warning] Only the requested bounded log tail is shown.\n');
    }
  } else {
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
    try {
      for await (const event of followLogs(options, controller.signal)) {
        if (options.json)
          await output(JSON.stringify({ ok: true, data: event }) + '\n', controller.signal);
        else if (event.type === 'record')
          await output(formatRecord(event.record), controller.signal);
        else process.stderr.write(`[warning] ${event.message}\n`);
      }
    } finally {
      process.off('SIGINT', stop);
      process.off('SIGTERM', stop);
    }
  }
  if (options.debug) process.stderr.write('[debug] command.complete\n');
  return { interrupted: controller.signal.aborted };
}
