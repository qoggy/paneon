import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

type Record = {
  timestamp?: string;
  type: string;
  payload: {
    type?: string;
    role?: string;
    name?: string;
    call_id?: string;
    arguments?: string;
    input?: string;
    output?: unknown;
    content?: { type: string; text?: string }[];
    [key: string]: unknown;
  };
};

function block(value: unknown) {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  // Keep arbitrary tool output, including Markdown fences, intact.
  const fences = text.match(/`+/g) ?? [];
  const fence = '`'.repeat(Math.max(3, ...fences.map((match) => match.length + 1)));
  return `${fence}\n${text}\n${fence}`;
}

/** A reading view over the raw rollout, without rewriting or shortening its records. */
export async function writeTranscript(output: string) {
  const source = await readFile(join(output, 'rollout.jsonl'), 'utf8');
  const sections = ['# Codex transcript'];
  const errors: { line: number; error: string }[] = [];
  let records = 0;
  for (const [index, line] of source.split('\n').entries()) {
    if (!line.trim()) continue;
    let record: Record;
    try {
      record = JSON.parse(line) as Record;
    } catch (error) {
      errors.push({ line: index + 1, error: String(error) });
      continue;
    }
    records++;
    const p = record.payload;
    const location = `rollout.jsonl:${index + 1} · ${record.timestamp ?? ''}`;
    if (record.type === 'turn_context' || record.type === 'token_usage_record') {
      sections.push(`## ${record.type}\n\n${location}\n\n${block(p)}`);
    } else if (record.type === 'response_item') {
      const label = p.role ?? p.name ?? p.type ?? record.type;
      sections.push(`## ${label}\n\n${location}\n\n${block(p)}`);
    } else if (record.type === 'compacted' || record.type === 'retained_context') {
      sections.push(`## ${record.type}\n\n${location}\n\n${block(p)}`);
    }
  }
  if (errors.length) sections.push(`## Parse errors\n\n${block(errors)}`);
  await writeFile(join(output, 'transcript.md'), sections.join('\n\n') + '\n');
  return { records, errors };
}
