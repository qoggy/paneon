# Annotations

Import `annotationValueSchema` and data types from `@qoggy/paneon/sdk`; import components, `useAnnotations` and `AnnotationAdapter` from `@qoggy/paneon/ui`. Call the feature 批注 in Chinese copy and annotation in English copy.

### Complete annotation panel

```tsx
import { useMemo, useRef } from 'react';
import { agent, definePanel, annotationValueSchema, z } from '@qoggy/paneon/sdk';
import { Card, AnnotationText, toast, usePageAnnotations } from '@qoggy/paneon/ui';
import type { AnnotationAdapter } from '@qoggy/paneon/ui';

const source = 'Use Redis for shared cache storage.';
const refSchema = z.literal('redis-plan');
type Ref = z.infer<typeof refSchema>;
const resultSchema = annotationValueSchema(refSchema);

function Panel() {
  const card = useRef<HTMLDivElement>(null);
  const adapter = useMemo<AnnotationAdapter<Ref>>(
    () => ({
      resolve(target) {
        return refSchema.safeParse(target.ref).success
          ? { status: 'ready', text: source }
          : { status: 'missing', message: 'Unknown plan.' };
      },
      locate() {
        card.current?.scrollIntoView({ block: 'center' });
      },
    }),
    [],
  );
  usePageAnnotations<Ref>({
    adapter,
    onSubmit: async (value) => {
      await agent.emit('annotations-submitted', value);
      toast.add({ title: 'Annotations submitted.', type: 'success' });
    },
  });
  return (
    <Card ref={card} className="p-4">
      <AnnotationText target="redis-plan">{source}</AnnotationText>
    </Card>
  );
}

export default definePanel({
  id: 'custom-annotations',
  requires: { paneon: '>=0.0.1 <0.1.0' },
  input: z.object({}).strict(),
  events: { 'annotations-submitted': resultSchema },
  render: Panel,
});
```

### Result data

- A result is `{annotations: [{id, targets, comment}]}`; there is no page-level comment. A target is `{ref, text?}`; without `text` it means the whole object. `sourceRef` appears only on [file annotations](#file-annotations).
- Do not build a separate page-level comment editor; an opinion about a whole document is an annotation on its heading.
- `text` is `{start, end, quote}`: UTF-16 offsets into the original string, end excluded, on grapheme boundaries, with `quote === source.slice(start, end)`.
- `ref` is any finite JSON value. For ordinary content use a stable string: `target="redis-plan"` is delivered as `ref: "redis-plan"`. For dynamic content include the source version. Functions, DOM elements and screen coordinates are not references.
- `annotationValueSchema(refSchema)` checks structure only.

### Annotation components

- `usePageAnnotations<TRef>({ onSubmit, adapter?, disabled?, allowEmptySubmit?, onRequestEdit? })` turns on annotations for the page: Paneon supplies the editor and a floating annotation list with the submit action. Call it once in the page component; nested components read the state with `useAnnotations`. Without it the page has no annotation controls.
- `onSubmit` receives the complete annotation list; the page emits the event itself.
- `adapter` is needed only for paginated, virtualized or versioned content; see [adapters](#adapters).
- `disabled` blocks editing and submission while saved annotations stay readable. To lock feedback after a successful submission, set `disabled` and pass `onRequestEdit`, which the list offers as a correction action that should unlock editing.
- `allowEmptySubmit` (default `false`) permits submitting an empty list, such as a correction that withdraws all feedback.
- `AnnotationText` takes `target`, plain-string `children` and optional `className`. JSX children are not supported. Unregistered DOM and graphics cannot be annotated.

### Controller

`useAnnotations<TRef>()` exposes:

- `value`, `activeAnnotationId`, `selectionTargets`, `submitting`, `error`.
- `createAnnotation(targets, comment?)`, `editAnnotation(id | null)`, `updateAnnotation(id, {targets, comment})`, `removeAnnotation(id)`. These change the draft immediately; keep target sets nonempty and IDs stable.
- Async `locate(target)` and `submit()`; handle their rejections in custom controls.
- `registerText({ref, source, segments})`, returning an unregister function for effect cleanup.

### Adapters

Registered plain strings resolve and locate without an adapter. Paginated, virtualized or versioned content needs one:

```ts
type AnnotationAdapter<TRef> = {
  resolve(
    target: AnnotationTarget<TRef>,
  ):
    | { status: 'ready'; text?: string }
    | { status: 'missing' | 'stale'; message: string }
    | Promise<
        { status: 'ready'; text?: string } | { status: 'missing' | 'stale'; message: string }
      >;
  locate(target: AnnotationTarget<TRef>): void | Promise<void>;
  targetRanges?(target: AnnotationTarget<TRef>): readonly Range[];
};
```

- `resolve` returns the exact original string for a target with `text`, or `missing` / `stale`, which keeps the draft. Retain old snapshots while annotations refer to them; never apply old offsets to newly fetched text.
- `locate` restores the right page or view before highlighting. Ignore obsolete async responses.
- `targetRanges` positions highlights for references that do not equal a registration, such as a line range within one diff side. Return `[]` when the source is not mounted; never search for the first matching quote.

### Markdown and DiffView

- `<Markdown annotationTarget="plan-a">{source}</Markdown>` registers the document; the target becomes `ref` unchanged. Give each document its own target, even when texts are identical. Offsets address the Markdown source, so a quote can include Markdown syntax, and a selection across separate source fragments becomes several targets.
- `<DiffView oldText="before" newText="after" annotationTargets={{ old: refA, new: refB }} />` registers each side; its reference becomes `ref` unchanged. The two sides need different references. Omit a side to disable annotations on it. Offsets address that side's complete original string.
- A `DiffViewHandle` ref (`useRef<DiffViewHandle>(null)`) provides `reveal(location)`, which expands context and scrolls once rendered, and `getRanges(location)` for the adapter's `targetRanges`. `DiffLocation` is `{kind: 'text', side, start, end, quote}`, `{kind: 'hunk', index}` (zero-based) or `{kind: 'file'}`; convert the page's own references into it.
- For another renderer, pass `registerText` `segments: {node: Text, sourceOffsets: (number | null)[]}[]`. Each array has `node.data.length + 1` UTF-16 boundaries into one `source`; use `null` for an unmappable boundary.

### Submission

- Paneon checks each target's range against its original text through the adapter or registration before calling `onSubmit`; if either fails, the draft stays.
- Paneon does not clear the draft, generate `replacesEventId` or choose a correction policy. Built-in pages submit each correction as a complete result with `replacesEventId` pointing to the previous one; follow that pattern when a correction should replace an earlier result.
- Drafts live in browser memory, so a reload can lose them. [Event limits](#deliver-events) apply.
