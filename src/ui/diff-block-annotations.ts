import { annotationTargetKey } from '../sdk/annotation';
import type { AnnotationTarget } from '../sdk/annotation';
import { diffBlocks } from '../shared/diff-model';
import type { DiffModel, DiffRow } from '../shared/diff-model';
import type { DiffLocation } from './diff-annotation';

export type DiffAnnotationBlock<TRef> = {
  rows: DiffRow[];
  targets: AnnotationTarget<TRef>[];
  locations: Extract<DiffLocation, { kind: 'text' }>[];
};

export function diffBlockKey(targets: readonly AnnotationTarget<unknown>[]) {
  return JSON.stringify(targets.map(annotationTargetKey).sort());
}

/** Keep the supplied side references and exact full-source offsets unchanged. */
export function diffAnnotationBlocks<TRef>(
  model: DiffModel,
  refs: { old?: TRef; new?: TRef },
): DiffAnnotationBlock<TRef>[] {
  return diffBlocks(model.rows).flatMap((rows) => {
    const targets: AnnotationTarget<TRef>[] = [];
    const locations: DiffAnnotationBlock<TRef>['locations'] = [];
    for (const side of ['old', 'new'] as const) {
      const ref = refs[side];
      const source = side === 'old' ? model.oldText : model.newText;
      const lines = rows.flatMap((row) => (row[side] ? [row[side]] : []));
      if (ref === undefined || source === undefined || !lines.length) continue;
      const start = lines[0].start;
      const end = lines[lines.length - 1].end;
      const text = { start, end, quote: source.slice(start, end) };
      targets.push({ ref, text });
      locations.push({ kind: 'text', side, ...text });
    }
    return targets.length ? [{ rows, targets, locations }] : [];
  });
}

export function diffBlockSummary<TRef>(
  block: DiffAnnotationBlock<TRef>,
  oldPath?: string,
  newPath?: string,
) {
  const paths = [...new Set([oldPath, newPath].filter(Boolean))].join(' → ');
  const lines = block.locations.flatMap((location) =>
    location.quote
      .replace(/\r?\n$/, '')
      .split(/\r?\n/)
      .map((line) => `${location.side === 'old' ? '-' : '+'}${line}`),
  );
  return [paths, ...lines].filter(Boolean).join('\n');
}

/** Share the add button's bounds with the editor so both stay next to the first changed row. */
export function diffBlockAnchor<TRef>(
  block: DiffAnnotationBlock<TRef>,
  gutters: ReadonlyMap<string, HTMLElement>,
  split: boolean,
): DOMRect | undefined {
  const bounds = block.rows.flatMap((row) =>
    (['old', 'new'] as const).flatMap((side) => {
      const line = row[side];
      const gutter = line && gutters.get(`${side}:${line.number}`);
      return gutter ? [{ side, rect: gutter.getBoundingClientRect() }] : [];
    }),
  );
  if (!bounds.length) return;
  const first = bounds.reduce((a, b) => (a.rect.top <= b.rect.top ? a : b));
  const x = split
    ? first.side === 'old'
      ? first.rect.right + 24
      : first.rect.left - 24
    : first.rect.right - 8;
  const top = Math.min(...bounds.map(({ rect }) => rect.top));
  const size = split ? 24 : 16;
  return new DOMRect(x - size / 2, top + (split ? 0 : 4), size, size);
}
