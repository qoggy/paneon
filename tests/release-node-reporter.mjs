import { inspect } from 'node:util';

/** Machine-readable counts from Node's test events, independent of terminal formatting. */
export default async function* releaseNodeReporter(events) {
  let counts = null;
  const failures = [];
  for await (const { type, data } of events) {
    if (type === 'test:summary' && !data.file) counts = data.counts;
    if (type !== 'test:fail' || data.todo || data.skip) continue;
    const error = data.details.error;
    if (error?.failureType === 'subtestsFailed') continue;
    failures.push({
      name: data.name,
      file: data.file,
      line: data.line,
      details: inspect(error, { colors: false, depth: 4 }),
      message:
        typeof error?.cause === 'string'
          ? error.cause
          : (error?.cause?.message ?? error?.message ?? String(error)),
    });
  }
  yield JSON.stringify({ counts, failures }) + '\n';
}
