import type { AnnotationTarget } from '@qoggy/paneon/sdk';
import { diffTargetText } from '../../shared/diff-schema.ts';
import { validSourceRange } from '../../shared/markdown-annotation-schema.ts';
import type { PRSnapshot } from './github.ts';
import type { PRRef } from './schema.ts';
export function resolvePRTarget(
  snapshot: PRSnapshot,
  target: AnnotationTarget<PRRef>,
): string | undefined {
  const source = snapshot.source,
    ref = target.ref;
  if (source.kind === 'diff') {
    if (ref.kind !== 'file' && ref.kind !== 'hunk' && ref.kind !== 'lines')
      throw new Error('Reference kind does not match the diff source.');
    if (!snapshot.model) throw new Error('Original diff content is missing.');
    return diffTargetText(snapshot.model, { ...target, ref });
  }
  if (ref.kind !== source.kind) throw new Error('Reference kind does not match its source.');
  if (source.kind === 'description') {
    if (snapshot.body === undefined || !validSourceRange(snapshot.body, target))
      throw new Error('Description quote does not match the preserved Markdown.');
    return snapshot.body;
  }
  if (target.text) throw new Error('PR overview and checks support whole-object feedback only.');
}
export function safeLink(value?: string) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? value : undefined;
  } catch {
    return undefined;
  }
}
