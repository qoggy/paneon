import { z } from '@qoggy/paneon/sdk';
import type { AnnotationTarget } from '@qoggy/paneon/sdk';
import type { DiffLocation } from '@qoggy/paneon/ui';
import { sourceLines } from './diff-model.ts';
import type { DiffModel } from './diff-model.ts';
export const gitRefSchema = z.intersection(
  z.object({ sourceId: z.string().min(1) }),
  z.discriminatedUnion('kind', [
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
  ]),
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
  const ref = target.ref;
  if (ref.kind === 'file') return { kind: 'file' };
  if (ref.kind === 'hunk')
    return { kind: 'hunk', index: model.hunks.findIndex((hunk) => hunk.patch === ref.patch) };
  const source = ref.side === 'old' ? model.oldText : model.newText;
  const range = target.text;
  if (source === undefined || !range) throw new Error('Missing diff text location.');
  const offset = sourceLines(source)[ref.startLine - 1].start;
  return {
    kind: 'text',
    side: ref.side,
    start: offset + range.start,
    end: offset + range.end,
    quote: range.quote,
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
/** Whole-side registrations become the actual selected line range on delivery. */
export function normalizeDiffTarget(
  model: DiffModel,
  target: AnnotationTarget<GitRef>,
): AnnotationTarget<GitRef> {
  const registered = diffTargetText(model, target);
  if (target.ref.kind !== 'lines' || !target.text || registered === undefined) return target;
  const lines = sourceLines(registered),
    startOffset = target.text.start,
    endOffset = target.text.end;
  const start = lines.findIndex((line) => line.end > startOffset),
    end = lines.findIndex((line) => line.end >= endOffset);
  return {
    ref: {
      ...target.ref,
      startLine: target.ref.startLine + start,
      endLine: target.ref.startLine + end,
    },
    text: {
      start: startOffset - lines[start].start,
      end: endOffset - lines[start].start,
      quote: target.text.quote,
    },
  };
}
