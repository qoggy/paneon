import { z } from '@qoggy/paneon/sdk';
import type { AnnotationTarget } from '@qoggy/paneon/sdk';
import type { DiffLocation } from '@qoggy/paneon/ui';
import { sourceLines } from './diff-model.ts';
import type { DiffModel } from './diff-model.ts';
export const gitLocationSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('file') }),
  z.object({
    kind: z.literal('hunk'),
    oldStart: z.number().int().nonnegative(),
    oldLines: z.number().int().nonnegative(),
    newStart: z.number().int().nonnegative(),
    newLines: z.number().int().nonnegative(),
    patch: z.string(),
  }),
  z.object({
    kind: z.literal('lines'),
    side: z.enum(['old', 'new']),
    startLine: z.number().int().positive(),
    endLine: z.number().int().positive(),
  }),
]);
export const gitRefSchema = z.intersection(
  z.object({ sourceId: z.string().min(1) }),
  gitLocationSchema,
);
export type GitRef = z.infer<typeof gitRefSchema>;
/** The Git/PR page owns its references; DiffView only registers them unchanged. */
export function diffAnnotationTargets(model: DiffModel, sourceId: string) {
  const targets: { old?: GitRef; new?: GitRef } = {};
  for (const side of ['old', 'new'] as const) {
    const source = side === 'old' ? model.oldText : model.newText;
    if (!source) continue;
    targets[side] = {
      sourceId,
      kind: 'lines',
      side,
      startLine: 1,
      endLine: sourceLines(source).length,
    };
  }
  return targets;
}

/** Convert the page's saved reference into coordinates in the full side source. */
export function diffTargetLocation(
  model: DiffModel,
  target: AnnotationTarget<GitRef>,
): DiffLocation {
  diffTargetText(model, target);
  const location = diffTargetCoordinates(model, target);
  if (!location) throw new Error('Missing diff text location.');
  return location;
}

/** Geometry queries may have no matching highlight; explicit location validates separately. */
export function diffTargetCoordinates(
  model: DiffModel,
  target: AnnotationTarget<GitRef>,
): DiffLocation | undefined {
  const ref = target.ref;
  if (ref.kind === 'file') return { kind: 'file' };
  if (ref.kind === 'hunk') {
    const index = model.hunks.findIndex((hunk) => hunk.patch === ref.patch);
    return index < 0 ? undefined : { kind: 'hunk', index };
  }
  const source = ref.side === 'old' ? model.oldText : model.newText;
  const range = target.text;
  if (source === undefined || !range) return;
  const line = sourceLines(source)[ref.startLine - 1];
  if (!line) return;
  const offset = line.start;
  return {
    kind: 'text',
    side: ref.side,
    start: offset + range.start,
    end: offset + range.end,
    quote: range.quote!,
  };
}
export function diffTargetText(
  model: DiffModel,
  target: AnnotationTarget<GitRef>,
): string | undefined {
  const ref = target.ref;
  if (ref.kind === 'file') {
    if (target.text) throw new Error('File targets cannot carry text.');
    return;
  }
  if (ref.kind === 'hunk') {
    if (
      target.text ||
      !model.hunks.some(
        (h) =>
          h.oldStart === ref.oldStart &&
          h.oldLines === ref.oldLines &&
          h.newStart === ref.newStart &&
          h.newLines === ref.newLines &&
          h.patch === ref.patch,
      )
    )
      throw new Error('Hunk does not match the preserved diff.');
    return;
  }
  const text = ref.side === 'old' ? model.oldText : model.newText;
  if (text === undefined) throw new Error('Missing diff side.');
  const lines = sourceLines(text);
  if (ref.endLine < ref.startLine || ref.endLine > lines.length || !target.text)
    throw new Error('Invalid source line range.');
  const selected = text.slice(lines[ref.startLine - 1].start, lines[ref.endLine - 1].end),
    range = target.text;
  if (
    range.start < 0 ||
    range.end <= range.start ||
    range.end > selected.length ||
    selected.slice(range.start, range.end) !== range.quote
  )
    throw new Error('Text does not match the preserved lines.');
  const segments = new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(selected);
  if (
    segments.containing(range.start)?.index !== range.start ||
    (range.end !== selected.length && segments.containing(range.end)?.index !== range.end)
  )
    throw new Error('Text splits a grapheme.');
  return selected;
}
/** Read optional display context without validating the saved selection. */
export function diffLineText(model: DiffModel, ref: Extract<GitRef, { kind: 'lines' }>): string {
  const source = (ref.side === 'old' ? model.oldText : model.newText) ?? '';
  return sourceLines(source)
    .slice(ref.startLine - 1, ref.endLine)
    .map((line) => line.text)
    .join('');
}

/** Convert delivery coordinates without comparing quotes or requiring locatable text. */
export function normalizeDiffTarget(
  model: DiffModel,
  target: AnnotationTarget<GitRef>,
): AnnotationTarget<GitRef> {
  if (
    target.ref.kind !== 'lines' ||
    !target.text ||
    target.sourceRef !== undefined ||
    target.type === 'mermaid'
  )
    return target;
  const registered = diffLineText(model, target.ref);
  const lines = sourceLines(registered),
    startOffset = target.text.start,
    endOffset = target.text.end;
  if (!lines.length) return target;
  const start = lines.findLastIndex((line) => line.start <= startOffset),
    end = lines.findLastIndex((line) => line.start < endOffset);
  return {
    ...target,
    ref: {
      ...target.ref,
      startLine: target.ref.startLine + start,
      endLine: target.ref.startLine + end,
    },
    text: {
      ...target.text,
      start: startOffset - lines[start].start,
      end: endOffset - lines[start].start,
    },
  };
}
