import pino from 'pino';
import type { Logger } from 'pino';
import {
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  statSync,
  write as fsWrite,
  close as fsClose,
} from 'node:fs';
import { rename, rm } from 'node:fs/promises';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { PACKAGE_VERSION } from '../shared/paths.js';
import type { RuntimeLoggingStatus } from '../shared/types.js';

export const LOG_RECORD_BYTES = 64 * 1024;
export const LOG_QUEUE_BYTES = 1024 * 1024;
export const LOG_FILE_BYTES = 5 * 1024 * 1024;
export const LOG_LEVELS = { debug: 20, info: 30, warn: 40, error: 50, fatal: 60 };
export type LogLevel = keyof typeof LOG_LEVELS | 'off';
export type LogFile = {
  path: string;
  name: string;
  runtimeId: string;
  archive: number;
  size: number;
  modified: number;
  identity: string;
};
const writeAsync = promisify(writeSyncCallback);
function writeSyncCallback(
  fd: number,
  buffer: Buffer,
  offset: number,
  length: number,
  callback: (error: NodeJS.ErrnoException | null, written: number) => void,
) {
  // node:fs.write keeps filesystem work outside the request thread.
  fsWrite(fd, buffer, offset, length, null, callback);
}
const closeAsync = promisify(fsClose);

export function logLevel(value = process.env.PANEON_LOG_LEVEL ?? 'info'): LogLevel {
  if (value === 'off' || Object.hasOwn(LOG_LEVELS, value)) return value as LogLevel;
  throw Object.assign(
    new Error('PANEON_LOG_LEVEL must be debug, info, warn, error, fatal, or off.'),
    { code: 'INVALID_ARGUMENT' },
  );
}
export function logFiles(directory: string): LogFile[] {
  if (!statSync(directory, { throwIfNoEntry: false })) return [];
  const result: LogFile[] = [];
  for (const name of readdirSync(directory)) {
    const match = /^(runtime-.+?)(?:\.([12]))?\.jsonl$/.exec(name);
    if (!match) continue;
    const path = join(directory, name);
    try {
      const s = statSync(path);
      result.push({
        path,
        name,
        runtimeId: match[1],
        archive: Number(match[2] ?? 0),
        size: s.size,
        modified: s.mtimeMs,
        identity: `${s.dev}:${s.ino}`,
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      process.stderr.write(`[warning] Log file rotated during inspection: ${name}\n`);
    }
  }
  return result;
}
function clip(value: unknown, bytes: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  return Buffer.byteLength(value) <= bytes
    ? value
    : Buffer.from(value)
        .subarray(0, bytes - 16)
        .toString('utf8') + '…[truncated]';
}
function errorValue(error: unknown, depth = 0, seen = new Set<unknown>()): unknown {
  if (!(error instanceof Error)) return error;
  if (seen.has(error)) return { type: error.name, message: '[Circular cause]', truncated: true };
  seen.add(error);
  const e = error as Error & { code?: unknown };
  return {
    ...(Buffer.byteLength(e.message) > 4096 ||
    Buffer.byteLength(e.stack ?? '') > 8192 ||
    (e.cause !== undefined && depth >= 3)
      ? { truncated: true }
      : {}),
    type: e.name,
    message: clip(e.message, 4096),
    stack: clip(e.stack, 8192),
    ...(e.code === undefined ? {} : { code: e.code }),
    ...(e.cause === undefined
      ? {}
      : { cause: depth < 3 ? errorValue(e.cause, depth + 1, seen) : '[Cause depth truncated]' }),
  };
}
// Bound developer context before serialization. Error causes have their own limit.
function contextValue(value: unknown, depth = 0, seen = new Set<object>()): unknown {
  if (value instanceof Error) return contextValue(errorValue(value), depth, seen);
  if (typeof value === 'string') return clip(value, 32768);
  if (typeof value === 'bigint') return value.toString();
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value)) return '[Circular]';
  if (depth >= 6) return '[Depth truncated]';
  seen.add(value);
  const entries = Object.entries(value);
  const result = Array.isArray(value)
    ? entries.slice(0, 100).map(([, v]) => contextValue(v, depth + 1, seen))
    : Object.fromEntries(
        entries.slice(0, 100).map(([k, v]) => [k, contextValue(v, depth + 1, seen)]),
      );
  seen.delete(value);
  if (entries.length > 100) {
    if (Array.isArray(result)) result.push('[Entries truncated]');
    else result.truncated = true;
  }
  return result;
}
function context(object: Record<string, unknown>): Record<string, unknown> {
  try {
    const result = contextValue(object) as Record<string, unknown>;
    // String clipping carries an explicit marker even when the final record fits.
    if (Object.values(object).some((v) => typeof v === 'string' && Buffer.byteLength(v) > 32768))
      result.truncated = true;
    return result;
  } catch (err) {
    return { serializationError: errorValue(err), truncated: true };
  }
}
function boundedRecord(line: string): Buffer {
  if (Buffer.byteLength(line) <= LOG_RECORD_BYTES) return Buffer.from(line);
  const record = JSON.parse(line) as Record<string, unknown>;
  const small: Record<string, unknown> = {
    truncated: true,
    originalBytes: Buffer.byteLength(line),
  };
  for (const key of [
    'schemaVersion',
    'time',
    'level',
    'pid',
    'paneonVersion',
    'runtimeId',
    'component',
    'instanceId',
  ]) {
    if (record[key] !== undefined)
      small[key] =
        record[key] !== null && typeof record[key] === 'object'
          ? clip(JSON.stringify(record[key]), 512)
          : typeof record[key] === 'string'
            ? clip(record[key], 512)
            : record[key];
  }
  small.msg = clip(record.msg, 4096);
  // The regular error serializer already bounded its message/stack/cause.
  if (record.err !== undefined) small.err = record.err;
  let output = JSON.stringify(small) + '\n';
  if (Buffer.byteLength(output) > LOG_RECORD_BYTES) {
    small.msg = clip(record.msg, 1024);
    small.err = { message: clip(JSON.stringify(record.err), 8192), truncated: true };
    output = JSON.stringify(small) + '\n';
  }
  return Buffer.from(output);
}

export type RuntimeLogging = {
  logger: Logger;
  runtimeId: string;
  status: () => RuntimeLoggingStatus;
  flush: () => Promise<void>;
  close: () => Promise<void>;
};
export function createRuntimeLogging(
  home: string,
  options: { runtimeId?: string; level?: LogLevel } = {},
): RuntimeLogging {
  const runtimeId = options.runtimeId ?? 'runtime-' + randomUUID();
  const level = options.level ?? logLevel();
  const directory = join(home, 'logs');
  const path = join(directory, runtimeId + '.jsonl');
  let state: RuntimeLoggingStatus['status'] = level === 'off' ? 'off' : 'active';
  let lastErrorCode: string | undefined;
  let fd: number | undefined;
  let size = 0;
  let queuedBytes = 0;
  let dropped = 0;
  let unreportedDrops = 0;
  let accepting = true;
  let halted = false;
  const queue: Buffer[] = [];
  let pumping: Promise<void> | undefined;
  let closing: Promise<void> | undefined;
  function reportFailure(error: unknown) {
    state = 'unavailable';
    lastErrorCode = (error as NodeJS.ErrnoException).code ?? 'LOG_WRITE_FAILED';
    halted = true;
    queue.length = 0;
    queuedBytes = 0;
    process.stderr.write(
      `[error] Paneon log writer unavailable: ${error instanceof Error ? error.message : String(error)}\n`,
    );
  }
  async function cleanup() {
    const groups = new Map<string, { files: LogFile[]; modified: number }>();
    for (const file of logFiles(directory)) {
      if (file.runtimeId === runtimeId) continue;
      const group = groups.get(file.runtimeId) ?? { files: [], modified: 0 };
      group.files.push(file);
      group.modified = Math.max(group.modified, file.modified);
      groups.set(file.runtimeId, group);
    }
    const history = [...groups.values()].sort((a, b) => b.modified - a.modified);
    for (const [index, group] of history.entries()) {
      if (index >= 3 || Date.now() - group.modified > 7 * 86400000)
        for (const file of group.files) await rm(file.path);
    }
  }
  async function rotate() {
    if (fd !== undefined) await closeAsync(fd);
    fd = undefined;
    await rm(join(directory, runtimeId + '.2.jsonl'), { force: true });
    for (const [from, to] of [
      [1, 2],
      [0, 1],
    ]) {
      const source = join(directory, runtimeId + (from ? `.${from}` : '') + '.jsonl');
      if (existsSync(source)) await rename(source, join(directory, runtimeId + `.${to}.jsonl`));
    }
    fd = openSync(path, 'a', 0o600);
    size = 0;
    await cleanup();
  }
  async function drain() {
    while (queue.length && !halted) {
      const line = queue[0];
      queue.shift();
      if (size + line.length > LOG_FILE_BYTES) await rotate();
      let offset = 0;
      while (offset < line.length)
        offset += await writeAsync(fd!, line, offset, line.length - offset);
      size += line.length;
      queuedBytes -= line.length;
    }
    if (unreportedDrops && !halted) {
      const count = unreportedDrops;
      unreportedDrops = 0;
      logger.warn(
        { droppedRecords: count },
        'Log records dropped because the write queue was full',
      );
    }
  }
  function pump() {
    if (pumping || halted) return;
    pumping = drain()
      .catch(reportFailure)
      .finally(() => {
        pumping = undefined;
        if (queue.length && !halted) pump();
      });
  }
  const logger = pino(
    {
      level: level === 'off' ? 'silent' : level,
      timestamp: false,
      base: null,
      serializers: {
        err: errorValue,
        req: (req: { id?: string; method?: string }) => ({ id: req.id, method: req.method }),
        res: (res: { statusCode?: number }) => ({ statusCode: res.statusCode }),
      },
      formatters: {
        bindings: ({ time: _time, level: _level, ...bindings }) => bindings,
        log: ({ time: _time, level: _level, ...object }) => ({
          ...context(object),
          time: new Date().toISOString(),
          schemaVersion: 1,
          pid: process.pid,
          paneonVersion: PACKAGE_VERSION,
          runtimeId,
        }),
      },
    },
    {
      write(line: string) {
        if (!accepting || state !== 'active') return;
        const record = boundedRecord(line);
        if (queuedBytes + record.length > LOG_QUEUE_BYTES) {
          dropped++;
          unreportedDrops++;
          return;
        }
        queue.push(record);
        queuedBytes += record.length;
        pump();
      },
    },
  );
  if (level !== 'off') {
    try {
      mkdirSync(directory, { recursive: true, mode: 0o700 });
      fd = openSync(path, 'a', 0o600);
    } catch (error) {
      reportFailure(error);
    }
  }
  // Serialize retention before the first normal write, using the same async pump.
  if (state === 'active') {
    pumping = cleanup()
      .catch(reportFailure)
      .finally(() => {
        pumping = undefined;
        if (queue.length && !halted) pump();
      });
  }
  async function flush() {
    while (pumping) await pumping;
  }
  return {
    logger,
    runtimeId,
    status: () => ({
      level,
      status: state,
      directory,
      ...(level === 'off' ? {} : { currentFile: path }),
      ...(lastErrorCode ? { lastErrorCode } : {}),
      droppedRecords: dropped,
    }),
    flush,
    close() {
      if (closing) return closing;
      closing = (async () => {
        const complete = (async () => {
          await flush();
          accepting = false;
          if (fd !== undefined) {
            const open = fd;
            fd = undefined;
            await closeAsync(open);
          }
        })().catch(reportFailure);
        let timer: ReturnType<typeof setTimeout> | undefined;
        const flushed = await Promise.race([
          complete.then(() => true),
          new Promise<false>((resolve) => {
            timer = setTimeout(() => resolve(false), 500);
          }),
        ]);
        clearTimeout(timer);
        if (!flushed) {
          accepting = false;
          halted = true;
          process.stderr.write(
            `[warning] Paneon log flush exceeded 500 ms; ${queuedBytes} buffered bytes may be lost.\n`,
          );
          queue.length = 0;
        }
      })();
      return closing;
    },
  };
}
