# Selection and annotations

Use these public primitives in custom pages; reuse a [standard page](../SKILL.md#built-in-pages) when its contract fits. Import data types and `annotationValueSchema` from `paneon/sdk`; import React components, `useAnnotations` and `AnnotationAdapter` from `paneon/ui`.

## Complete custom panel

A runnable copy is available at [annotations/panel.tsx](../assets/examples/annotations/panel.tsx). Save the following as `panel.tsx` to customize it. It has precisely selectable plain text inside an ordinary card, a contextual annotation editor and an annotation menu. Its adapter resolves the original text and locates the card. The server action validates the fixed source before the browser emits the declared event.

```tsx
import { useMemo, useRef, useState } from 'react';
import { agent, definePanel, annotationValueSchema, serverAction, z } from 'paneon/sdk';
import { Card, AnnotationMenu, AnnotationRoot, AnnotationText } from 'paneon/ui';
import type { AnnotationAdapter } from 'paneon/ui';

const source = 'Use Redis for shared cache storage.';
const refSchema = z.literal('redis-plan');
type Ref = z.infer<typeof refSchema>;
const resultSchema = annotationValueSchema(refSchema);

export const validateAnnotations = serverAction({
  kind: 'query',
  input: resultSchema,
  handler: (_ctx, input) => {
    const boundaries = new Set([
      ...Array.from(
        new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(source),
        (part) => part.index,
      ),
      source.length,
    ]);
    for (const entry of input.annotations) {
      for (const target of entry.targets) {
        const range = target.text;
        if (
          range &&
          (!boundaries.has(range.start) ||
            !boundaries.has(range.end) ||
            source.slice(range.start, range.end) !== range.quote)
        ) {
          throw new Error('The selected text does not match this plan.');
        }
      }
    }
    return input;
  },
});

function Panel() {
  const card = useRef<HTMLDivElement>(null);
  const [saved, setSaved] = useState('');
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
  return (
    <AnnotationRoot<Ref>
      adapter={adapter}
      onSubmit={async (value) => {
        setSaved('');
        const checked = await validateAnnotations(value);
        const receipt = await agent.emit('annotations-submitted', checked);
        setSaved(`Saved as event ${receipt.id}.`);
      }}
    >
      <AnnotationMenu />

      <Card ref={card} className="p-4">
        <AnnotationText target="redis-plan">{source}</AnnotationText>
      </Card>

      {saved && <p role="status">{saved}</p>}
    </AnnotationRoot>
  );
}

export default definePanel({
  id: 'custom-annotations',
  requires: { paneon: '0.0.0' },
  input: z.object({}).strict(),
  events: { 'annotations-submitted': resultSchema },
  render: Panel,
});
```

Run with `paneon panel run ./panel.tsx --cwd "$PWD" --json` and deliver its URL. The menu's submit button invokes `onSubmit`, which validates and emits `annotations-submitted`. The agent must explicitly read and handle that event; rendering the page does not consume it:

```bash
paneon panel events <instance-id> --consumer annotation-reviewer --wait-ms 30000 --json
```

Read the selected text and `comment` in each event's `payload.annotations`, then act on the human's request. After handling the delivered events, acknowledge through the last handled event ID:

```bash
paneon panel ack <instance-id> --consumer annotation-reviewer --through <last-handled-event-id> --json
```

Reading alone does not acknowledge events. See [events/ack](cli.md#deliver-events-to-the-agent). The example retains editable annotations after success; another explicit submission emits another independent complete result. It deliberately does not implement the standard-page correction policy below.

## Data and interaction

The feature is called **批注** in Chinese and **annotation** in English. The `comment` event field stores annotation text; it is not an alternative feature name. Each annotation is tied to one or more content targets.

For ordinary content, use a single stable string such as `target="redis-plan"`. The submitted `ref` is that same string; there is no separate `kind` and `id` pair to fill in.

A result has an `annotations` list; there is no page-level comment field. Each annotation is `{id, targets, comment}`; targets are `{ref, text?}`. A target without `text` means the whole object. `text` contains `{start,end,quote}` using original-string UTF-16 offsets, with end excluded and `quote === source.slice(start,end)`. Ranges must end on complete grapheme boundaries. Empty annotation text means selection without an opinion; do not create a second selected-only structure. Several positions can share one annotation, and one submission can contain several annotations.

`ref` is finite, acyclic JSON identifying the semantic object and, for dynamic content, its source version. Functions, DOM elements and screen coordinates are not references. `annotationValueSchema(refSchema)` validates the structure, JSON references, IDs and range shape; it does not fetch or verify external source content. A page's server action must validate its own references and ranges against the retained original snapshot before emitting them. Pass the needed original evidence and fixed configuration explicitly; action context has no `params` property. The Git adapter builds deduplicated source/evidence from browser-retained versions and validates it without old backend Maps or rereading current files. Whole-content hashes label versions; selected fragments establish internal consistency, not proof of Git origin.

Normal browsing preserves links, buttons, inputs and copying. Normal text selection over registered content shows a nearby “批注” action without changing the draft. Click it to open a temporary editor, then Save to keep the annotation (including an empty annotation) or Cancel/Escape to discard it. Numbered markers reopen saved annotations. Editing uses a separate buffer: Cancel retains the old annotation; Save updates its stable ID; Delete removes it through the icon button. The editor keeps only the text input and actions visible, with accessible dialog and input names. `AnnotationText` accepts `target`, required `children: string` and optional `className`; it renders the plain-string children and registers their exact offsets. Pass text as `<AnnotationText target="redis-plan">{source}</AnnotationText>`; JSX elements are not supported as children. Explicitly registered link text can be selected without stealing normal link clicks. Arbitrary graphics and unregistered DOM are not automatically annotatable.

`AnnotationRoot` owns the annotation state, selection handling and exactly one internal contextual surface. It adds no layout wrapper. Do not mount a surface yourself; it is not a public export. Place `AnnotationMenu` wherever the page needs its annotation directory. Hover or click to open it. Its fixed footer contains `AnnotationSubmitButton` by default. Each annotation keeps a stable display number for the browser session; multi-target annotations share one number. Clicking a directory entry locates the source; the pencil icon locates and opens the editor, and the trash icon deletes the draft annotation.

To put submission elsewhere, render `<AnnotationMenu showSubmit={false} />` and a separate `<AnnotationSubmitButton />` inside the same Root. The menu accepts `className` and `showSubmit`; the submit button accepts `className` and `children`. Page headers, toolbars and sidebars remain ordinary author-owned layout. There is no public Controls, Toolbar or Surface wrapper. Nested components use the same `TRef` with `useAnnotations<TRef>()`.

Saving the editor only updates the current browser-memory draft. An explicit menu or separate submit button calls `submit()`, validates targets, and invokes the Root's required `onSubmit`. The Root does not automatically emit an event or consume annotations. In the complete example above, `onSubmit` validates the source with `validateAnnotations`, then calls `agent.emit('annotations-submitted', checked)`. The declared panel event and the agent's events/ack consumer complete the flow. Refreshing or closing the page can discard unsubmitted drafts.

## Controller and adapters

`useAnnotations<TRef>()` exposes:

- `value`, `activeAnnotationId`, `selectionTargets`, `submitting`, `error`. `selectionTargets` exposes the pending text selection or currently edited targets.
- `createAnnotation(targets, comment?)`.
- `editAnnotation(id | null)`, `updateAnnotation(id, {targets,comment})`, `removeAnnotation(id)`.
- Async `locate(target)` and `submit()`; handle rejected promises in custom controls. Default controls already present errors.
- `registerText({ref,source,segments})`, returning an unregister function for a component effect.

`createAnnotation`/`updateAnnotation` remain low-level immediate draft operations for custom controls; the supplied contextual editor uses an independent temporary buffer until Save. `editAnnotation(null)` finishes the low-level active entry without deleting it. Normal text selection inside a Root always starts a new annotation instead of implicitly appending it to another editor. Keep nonempty target sets; removing the final target removes that entry. Retain annotation IDs when editing an annotation.

Without an adapter, registered plain strings can be resolved and located. Pagination, virtualized content and older dynamic snapshots need an adapter:

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

`targetRanges` is an optional synchronous geometry bridge for references that do not directly equal a text registration (for example, a selected line interval within one registered diff side). Derive the ranges from the retained source ID, side and exact registered source offsets. Return an empty array when that source/view is not mounted; never search for the first matching quote or reuse an old range on a newer snapshot. Return separate ranges for different scrolling containers. The Surface clips them against their actual scrolling ancestors. This bridge only positions highlights, numbered markers and editors; it does not replace `resolve` validation, create annotations, or alter event coordinates.

`AnnotationTarget` is an SDK **data type** describing a reference and optional text range; there is no UI component with that name. `resolve` must return the exact original string when the target has a text range. `locate` restores the appropriate source/view/page before highlighting. A filtered-out item is not automatically stale. Retain old snapshots while feedback refers to them; never apply an old offset to newly fetched text. If the matching source is unavailable, return `missing`/`stale` and preserve the draft. Ignore obsolete async query responses when restoring a view. Unmounting a registration does not delete saved annotations.

## Complex content adapters

Import `Markdown` and `DiffView` directly from `paneon/ui`. Neither renderer reads Git or chooses a submission policy.

- `<Markdown annotationTarget="plan-a">{source}</Markdown>` enables annotations inside an existing `AnnotationRoot`. Omit the prop for ordinary Markdown without a Root. Provide a distinct stable target for each independent document, even when texts are identical. The value becomes `ref` unchanged; versions and source coordinates are not extra public props. Saved/in-progress drafts retain their original displayed text until removed. This does not persist drafts across page reloads.
- `<DiffView oldText="before" newText="after" />` works without a source ID, Git session or Root. Optional `sourceId` enables existing Root-based annotations. Paths/revisions, `locateTarget`, `defaultExpanded` and `onCollapse` remain optional. There is no file-heading or file-only prop. Use `createDiffModel` and model types from `paneon/sdk` for precomputed models. Git reference validation stays in the supplied page; see [Git review](git-review.md).

For example, two identical documents stay distinguishable without nested source/version props:

```tsx
<AnnotationRoot onSubmit={handleSubmit}>
  <Markdown annotationTarget="plan-a">{sameContent}</Markdown>
  <Markdown annotationTarget="plan-b">{sameContent}</Markdown>
  <AnnotationMenu />
</AnnotationRoot>
```

The two references are delivered unchanged as `ref: "plan-a"` and `ref: "plan-b"`. A retained draft keeps its original displayed text during prop updates; this is browser-session source protection, not disk-backed recovery. Page-specific validators and correction policies remain in the supplied pages, not new public SDK validation functions.

Use these adapters instead of copying the feedback state machine. For another rich renderer, `registerText` accepts `segments: {node: Text, sourceOffsets: (number|null)[]}[]`. Each array has `node.data.length + 1` UTF-16 boundaries pointing into one declared `source`; use null for an unmappable boundary and unregister in effect cleanup. Do not locate repeated words using the first `indexOf` match. Continuous ranges across Markdown formatting can include intervening source syntax; disconnected source ranges become multiple targets. Synthetic controls and diagram interiors remain unregistered.

## Submission and corrections

Editor Save only changes the page draft. “提交批注” is the separate action that submits the whole draft. An unsaved editor blocks submission with an inline prompt to Save or Cancel first; nothing is silently saved or discarded. Merely selecting or copying text does not block submission. Root freezes one complete result, checks structure and resolves targets, then awaits `onSubmit`. It blocks draft mutation and duplicate submission while pending. On failure, errors are available through the controller/default controls and drafts remain. Show success only after `agent.emit` returns a durable event receipt. An emitted request does not execute the requested operation or wake an ended agent.

Root does not clear/lock on success, generate `replacesEventId`, store receipts or choose a correction policy. Custom pages own those choices. Supplied standard pages keep a successful result visible, require an explicit edit action, then save a complete correction with `replacesEventId` referencing that browser page's previous successful receipt. Failed saves do not advance it. An empty correction can clear earlier table/review/Git feedback; first empty feedback is rejected. See each page's contract for its result schema.

The skill's [submission helper](../assets/shared/submission.ts) supports this supplied-page policy. Page code still performs semantic validation, declares its event schema and controls success/editing UI; do not swallow an error and present success. Corrected events append history and do not undo an agent's earlier business actions. The agent decides how to reconcile effects already performed.

Drafts and the current receipt live in the browser page; full reload does not promise recovery. Only emitted events are durable. New rounds/questions use new instances; watching TSX does not reload parameter files. [CLI limits](cli.md) apply without truncating feedback.
