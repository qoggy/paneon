import { logLevel } from '../runtime/logging.js';
import { spawn } from 'node:child_process';
import { readFileSync, mkdirSync, rmSync, writeFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { PANEON_HOME, PACKAGE_ROOT, PACKAGE_VERSION } from '../shared/paths.js';
import {
  HTTP_BODY_LIMIT_BYTES,
  requestBodyBytes,
  bodyTooLargeDiagnostic,
} from '../shared/limits.js';
import { PROTOCOL_VERSION, PaneonError } from '../shared/types.js';
import type { RuntimeDescriptor, JsonValue, Diagnostic } from '../shared/types.js';
function readDescriptor(): RuntimeDescriptor | null {
  let text: string;
  try {
    text = readFileSync(join(PANEON_HOME, 'runtime.json'), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw new PaneonError('RUNTIME_UNAVAILABLE', 'The runtime descriptor could not be read.');
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new PaneonError('RUNTIME_UNAVAILABLE', 'The runtime descriptor is invalid.');
  }
  if (!value || typeof value !== 'object')
    throw new PaneonError('RUNTIME_UNAVAILABLE', 'The runtime descriptor is invalid.');
  const d = value as RuntimeDescriptor;
  if (
    !Number.isInteger(d.pid) ||
    d.pid < 1 ||
    !Number.isInteger(d.port) ||
    d.port < 1 ||
    d.port > 65535 ||
    typeof d.runtimeId !== 'string' ||
    !d.runtimeId ||
    typeof d.controlToken !== 'string' ||
    !d.controlToken ||
    typeof d.paneonVersion !== 'string' ||
    !Number.isInteger(d.protocolVersion) ||
    typeof d.startedAt !== 'string'
  )
    throw new PaneonError('RUNTIME_UNAVAILABLE', 'The runtime descriptor is invalid.');
  return d;
}

function alive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
let loggingWarningReported = false;
export async function discover(allowVersionMismatch = false): Promise<RuntimeDescriptor | null> {
  const descriptor = readDescriptor();
  if (!descriptor) return null;
  if (
    typeof descriptor.port !== 'number' ||
    typeof descriptor.controlToken !== 'string' ||
    typeof descriptor.runtimeId !== 'string'
  )
    throw new PaneonError('RUNTIME_UNAVAILABLE', 'The runtime descriptor is invalid.');
  let response: Response;
  try {
    response = await fetch(`http://127.0.0.1:${descriptor.port}/health`, {
      headers: { Authorization: `Bearer ${descriptor.controlToken}` },
      signal: AbortSignal.timeout(1500),
    });
  } catch {
    if (!alive(descriptor.pid)) return null;
    throw new PaneonError('RUNTIME_UNAVAILABLE', 'The runtime could not be contacted.');
  }
  let result: { ok: boolean; data?: RuntimeDescriptor };
  try {
    result = (await response.json()) as { ok: boolean; data?: RuntimeDescriptor };
  } catch {
    throw new PaneonError('RUNTIME_UNAVAILABLE', 'The runtime health response is invalid.');
  }
  if (
    !result.ok ||
    !result.data ||
    result.data.runtimeId !== descriptor.runtimeId ||
    result.data.protocolVersion !== PROTOCOL_VERSION ||
    result.data.paneonVersion !== descriptor.paneonVersion
  )
    throw new PaneonError(
      'RUNTIME_UNAVAILABLE',
      'The runtime identity or protocol could not be verified.',
    );
  if (!allowVersionMismatch && result.data.paneonVersion !== PACKAGE_VERSION)
    throw new PaneonError(
      'RUNTIME_VERSION_MISMATCH',
      'The running service uses a different Paneon version. Run paneon server stop, then run the panel again.',
      { expectedVersion: PACKAGE_VERSION, actualVersion: result.data.paneonVersion },
    );
  const { logging: _oldLogging, ...identity } = descriptor;
  if (result.data.logging?.status === 'unavailable' && !loggingWarningReported) {
    loggingWarningReported = true;
    process.stderr.write(
      `[warning] Runtime logging is unavailable: ${result.data.logging.lastErrorCode ?? 'LOG_WRITE_FAILED'}.\n`,
    );
  }
  return { ...identity, ...(result.data.logging ? { logging: result.data.logging } : {}) };
}
export async function ensureRuntime() {
  const current = await discover();
  if (current) return current;
  mkdirSync(PANEON_HOME, { recursive: true, mode: 0o700 });
  const lock = join(PANEON_HOME, 'startup.lock');
  let owner = false;
  for (let attempt = 0; attempt < 600; attempt++) {
    try {
      mkdirSync(lock, { mode: 0o700 });
      writeFileSync(join(lock, 'pid'), String(process.pid));
      owner = true;
      break;
    } catch {
      try {
        const pid = Number(readFileSync(join(lock, 'pid'), 'utf8'));
        if (pid && !alive(pid)) {
          rmSync(lock, { recursive: true, force: true });
          continue;
        }
        if (!existsSync(join(lock, 'pid')) && Date.now() - statSync(lock).mtimeMs > 5000)
          rmSync(lock, { recursive: true, force: true });
      } catch {
        /* owner is writing */
      }
      const running = await discover();
      if (running) return running;
      await delay(100);
    }
  }
  if (!owner)
    throw new PaneonError('RUNTIME_UNAVAILABLE', 'Another command is still starting the runtime.');
  try {
    const running = await discover();
    if (running) return running;
    logLevel();
    const child = spawn(process.execPath, [join(PACKAGE_ROOT, 'dist/runtime/index.js')], {
      detached: true,
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      env: process.env,
    });
    let failed: Error | undefined;
    child.once('error', (err) => {
      failed = err;
    });
    child.once('message', (detail: Diagnostic) => {
      failed = new PaneonError(detail.code, detail.message, detail.details);
    });
    child.unref();
    try {
      for (let attempt = 0; attempt < 900; attempt++) {
        if (failed || child.exitCode !== null) break;
        await delay(100);
        const ready = await discover();
        if (ready) return ready;
      }
      if (failed) throw failed;
    } finally {
      if (child.connected) child.disconnect();
    }
    throw Object.assign(
      new PaneonError(
        'RUNTIME_UNAVAILABLE',
        `The runtime did not start. Inspect logs with paneon server logs (${join(PANEON_HOME, 'logs')}).`,
      ),
      failed ? { cause: failed } : {},
    );
  } finally {
    rmSync(lock, { recursive: true, force: true });
  }
}
export async function call(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    start?: boolean;
    allowVersionMismatch?: boolean;
  } = {},
) {
  const body = options.body === undefined ? undefined : JSON.stringify(options.body);
  if (body !== undefined && requestBodyBytes(body) > HTTP_BODY_LIMIT_BYTES) {
    const detail = bodyTooLargeDiagnostic();
    throw new PaneonError(detail.code, detail.message, detail.details);
  }
  const runtime = options.start
    ? await ensureRuntime()
    : await discover(options.allowVersionMismatch);
  if (!runtime) throw new PaneonError('SERVER_NOT_RUNNING', 'The Paneon service is not running.');
  let response: Response;
  try {
    response = await fetch(`http://127.0.0.1:${runtime.port}${path}`, {
      method: options.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${runtime.controlToken}`,
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body } : {}),
    });
  } catch {
    throw new PaneonError(
      'RESULT_UNKNOWN',
      'The runtime connection closed; the operation result is unknown.',
    );
  }
  const result = (await response.json()) as {
    ok: boolean;
    data: JsonValue;
    error?: { code: string; message: string; details?: Record<string, JsonValue> };
  };
  if (!result.ok)
    throw new PaneonError(
      result.error?.code ?? 'RUNTIME_UNAVAILABLE',
      result.error?.message ?? 'The runtime request failed.',
      result.error?.details,
    );
  return result.data;
}
export async function serverStatus() {
  const descriptor = await discover();
  if (!descriptor) return { running: false, runtime: null };
  const { controlToken: _, ...runtime } = descriptor;
  return { running: true, runtime: { ...runtime, host: '127.0.0.1' } };
}
export async function stopServer() {
  const descriptor = await discover(true);
  if (!descriptor) return { stopped: true, alreadyStopped: true, runtimeId: null };
  await call('/api/stop', { method: 'POST', allowVersionMismatch: true });
  for (let i = 0; i < 100; i++) {
    await delay(50);
    if (!alive(descriptor.pid))
      return { stopped: true, alreadyStopped: false, runtimeId: descriptor.runtimeId };
  }
  throw new PaneonError('RUNTIME_UNAVAILABLE', 'The service did not finish stopping.');
}
