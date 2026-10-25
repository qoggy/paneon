import { StringDecoder } from 'node:string_decoder';
import { stripVTControlCharacters } from 'node:util';
import { PaneonError } from '../shared/types.js';
import type { Diagnostic, JsonValue } from '../shared/types.js';

export type BuildStage = 'typecheck' | 'client-build' | 'server-build' | 'metadata' | 'process';
const limits = { message: 8 * 1024, frame: 16 * 1024, stack: 32 * 1024, stderr: 64 * 1024 };
const marker = '\n[truncated]';
export function boundedText(text: string, limit: number, tail = false) {
  const bytes = Buffer.from(text);
  if (bytes.length <= limit) return { text, truncated: false };
  const size = limit - Buffer.byteLength(marker);
  let start = tail ? bytes.length - size : 0;
  let end = tail ? bytes.length : size;
  // Buffer boundaries must not split a UTF-8 character.
  while (start < end && (bytes[start] & 0xc0) === 0x80) start++;
  if (!tail) while (end > start && (bytes[end] & 0xc0) === 0x80) end--;
  const part = bytes.subarray(start, end).toString('utf8');
  return { text: tail ? marker + part : part + marker, truncated: true };
}

// Decode incrementally, so even a multibyte character split across pipe chunks survives.
export function stderrTail() {
  const decoder = new StringDecoder('utf8');
  let text = '';
  let truncated = false;
  const append = (chunk: string) => {
    const value = boundedText(text + chunk, limits.stderr, true);
    text = value.text;
    truncated ||= value.truncated;
  };
  return {
    write(chunk: Buffer) {
      append(decoder.write(chunk));
    },
    read() {
      append(decoder.end());
      return { stderr: text, ...(truncated ? { truncated: true } : {}) };
    },
  };
}
type RecordValue = Record<string, unknown>;
function object(value: unknown): RecordValue | undefined {
  return value !== null && typeof value === 'object' ? (value as RecordValue) : undefined;
}
function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}
function integer(value: unknown, min: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min;
}
// Existing domain details are already JSON by contract. Copy defensively rather than
// sending Error objects, prototypes or circular references through IPC.
function plain(value: unknown, seen = new Set<object>(), depth = 0): JsonValue | undefined {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (!object(value) || seen.has(value as object) || depth > 16) return undefined;
  seen.add(value as object);
  const result: JsonValue = Array.isArray(value)
    ? value.map((item) => plain(item, seen, depth + 1) ?? null)
    : Object.fromEntries(
        Object.entries(value as RecordValue).flatMap(([key, item]) => {
          const copy = plain(item, seen, depth + 1);
          return copy === undefined ? [] : [[key, copy]];
        }),
      );
  seen.delete(value as object);
  return result;
}
export function buildDiagnostic(error: unknown, stage: BuildStage, entryPath?: string): Diagnostic {
  const root = object(error);
  const seen = new Set<object>();
  const errors: RecordValue[] = [];
  function visit(value: unknown) {
    const item = object(value);
    if (!item || seen.has(item) || errors.length >= 16) return;
    seen.add(item);
    // Rolldown/esbuild/AggregateError wrappers carry actionable errors here.
    if (Array.isArray(item.errors)) item.errors.slice(0, 16).forEach(visit);
    errors.push(item);
    visit(item.cause);
  }
  visit(error);
  const domain = error instanceof PaneonError;
  const primary = domain ? root : (errors.find((e) => text(e.message) || text(e.text)) ?? root);
  const details = (domain ? plain(error.details) : undefined) as
    Record<string, JsonValue> | undefined;
  const result: Record<string, JsonValue> = {
    stage,
    ...(entryPath ? { entryPath } : {}),
    ...details,
  };
  const message = boundedText(
    stripVTControlCharacters(
      (domain ? text(error.message) : (text(primary?.message) ?? text(primary?.text))) ??
        text(error) ??
        'Panel compilation failed.',
    ),
    limits.message,
  );
  if (message.truncated) result.truncated = true;
  // Never combine one aggregate sibling's message with another sibling's location.
  const toolFile = text(primary?.id);
  if (!result.file && toolFile) result.file = toolFile;
  const positioned =
    primary && (object(primary.loc) || object(primary.location)) ? primary : undefined;
  if (positioned) {
    const loc = object(positioned.loc) ?? object(positioned.location) ?? {};
    // Rolldown BindingLogLocation and esbuild Location use line=1, column=0.
    const file = text(loc.file) ?? text(positioned.id);
    if (file) result.file = file;
    if (integer(loc.line, 1)) result.line = loc.line;
    if (integer(loc.column, 0)) {
      // esbuild columns are UTF-8 bytes; Rolldown columns are UTF-16 units.
      result.column =
        positioned.location && typeof loc.lineText === 'string'
          ? Buffer.from(loc.lineText).subarray(0, loc.column).toString('utf8').length + 1
          : loc.column + 1;
    }
    if (!result.frame && text(loc.lineText)) result.frame = loc.lineText as string;
  }
  for (const key of ['frame', 'stack', 'diagnostic'] as const) {
    const source = text(result[key]) ?? text(primary?.[key]);
    if (source) {
      const value = boundedText(
        stripVTControlCharacters(source),
        key === 'diagnostic' ? limits.message : limits[key],
      );
      result[key] = value.text;
      if (value.truncated) result.truncated = true;
    }
  }
  // Only actual cause links belong here; aggregate siblings are separate failures.
  const causes: string[] = [];
  const causeSeen = new Set<object>();
  let cause = object(primary?.cause);
  while (cause && !causeSeen.has(cause) && causeSeen.size < 16) {
    causeSeen.add(cause);
    const reason = text(cause.message) ?? text(cause.text);
    const stack = text(cause.stack);
    if (reason || stack) causes.push(stack ?? reason ?? '');
    cause = object(cause.cause);
  }
  if (causes.length) {
    const value = boundedText(stripVTControlCharacters(causes.join('\nCaused by: ')), limits.stack);
    result.cause = value.text;
    if (value.truncated) result.truncated = true;
  }
  return { code: domain ? error.code : 'BUILD_FAILED', message: message.text, details: result };
}
export function buildError(error: unknown, stage: BuildStage, entryPath?: string) {
  const value = buildDiagnostic(error, stage, entryPath);
  return new PaneonError(value.code, value.message, value.details);
}
