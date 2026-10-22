# Selection and comments

Use these public primitives in custom pages; reuse a [standard page](../SKILL.md#built-in-pages) when its contract fits. Import data types and `feedbackSchema` from `paneon/sdk`; import React components, `useFeedback` and `FeedbackAdapter` from `paneon/ui`.

## Complete custom panel

Save this as `panel.tsx`. It has a selectable card, precisely selectable plain text, a contextual comment surface and a compact toolbar. Its adapter resolves the original text and locates the card. The server action validates the fixed source before the browser emits the declared event.

```tsx
import { useMemo, useRef, useState } from 'react';
import { agent, definePanel, feedbackSchema, serverAction, z } from 'paneon/sdk';
import {
  Card,
  FeedbackSurface,
  FeedbackToolbar,
  FeedbackProvider,
  FeedbackTarget,
  FeedbackText,
} from 'paneon/ui';
import type { FeedbackAdapter } from 'paneon/ui';

const source = 'Use Redis for shared cache storage.';
const refSchema = z.object({ kind: z.literal('plan'), id: z.literal('redis') }).strict();
type Ref = z.infer<typeof refSchema>;
const resultSchema = feedbackSchema(refSchema);

export const validateFeedback = serverAction({
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
  const adapter = useMemo<FeedbackAdapter<Ref>>(
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
    <FeedbackProvider<Ref>
      adapter={adapter}
      onSubmit={async (value) => {
        setSaved('');
        const checked = await validateFeedback(value);
        const receipt = await agent.emit('feedback-submitted', checked);
        setSaved(`Saved as event ${receipt.id}.`);
      }}
    >
      <FeedbackSurface />
      <FeedbackToolbar />
      <FeedbackTarget target={{ kind: 'plan', id: 'redis' }} asChild>
        <Card ref={card} className="p-4">
          <FeedbackText target={{ kind: 'plan', id: 'redis' }} text={source} />
        </Card>
      </FeedbackTarget>
      {saved && <p role="status">{saved}</p>}
    </FeedbackProvider>
  );
}

export default definePanel({
  id: 'custom-feedback',
  requires: { paneon: '0.0.0' },
  input: z.object({}).strict(),
  events: { 'feedback-submitted': resultSchema },
  render: Panel,
});
```

Run with `paneon panel run ./panel.tsx --cwd "$PWD" --json` and deliver its URL. Read `feedback-submitted` with [events/ack](cli.md#deliver-events-to-the-agent). The example retains editable feedback after success; another click saves another independent complete result. It deliberately does not implement the standard-page correction policy below.

## Data and interaction

A result has `annotations` and an optional overall `comment`. Each annotation is `{id, targets, comment}`; targets are `{ref, text?}`. A target without `text` means the whole object. `text` contains `{start,end,quote}` using original-string UTF-16 offsets, with end excluded and `quote === source.slice(start,end)`. Ranges must end on complete grapheme boundaries. Empty annotation comments mean selection without a comment; do not create a second selected-only structure. Several positions can share one comment, and one submission can contain several comments.

`ref` is finite, acyclic JSON identifying the semantic object and, for dynamic content, its source version. Functions, DOM elements and screen coordinates are not references. `feedbackSchema(refSchema)` validates the structure, JSON references, IDs and range shape; it does not fetch or verify external source content. A page's server action must validate its own references and ranges against the retained original snapshot before emitting them. Pass the needed snapshot explicitly; action context has no `params` property.

Normal browsing preserves links, buttons, inputs and copying. Normal text selection over registered content shows a nearby “评论” action without changing the draft. Click it to open a temporary editor, then Save to keep the comment (including an empty comment) or Cancel/Escape to discard it. Numbered markers reopen saved comments. Editing uses a separate buffer: Cancel retains the old comment; Save updates its stable ID; Delete removes it. In the compact “选择对象” mode, select any number of registered objects first; the toolbar’s “评论” action opens their shared temporary editor only when the selection is ready. Thus a large editor never blocks ongoing row/column selection. Save keeps one multi-target comment; Cancel drops that temporary selection. This mode does not run business actions. `FeedbackTarget` registers whole-object selection; `asChild` reuses the child element, including valid table rows/cells, instead of inserting a wrapper. `FeedbackText` renders a plain string and registers its exact offsets. Explicitly registered link text can be selected without stealing normal link clicks. Arbitrary graphics and unregistered DOM are not automatically annotatable.

`FeedbackProvider` owns state and has no visible wrapper. Render `FeedbackSurface` once inside the provider. It renders only overlays and does not wrap the page or alter registered text nodes. Place `FeedbackToolbar` in the page’s existing toolbar: it contains object selection, optional overall-comment editing, a compact “评论 (N)” menu for locating comments across unmounted views/pages, and “提交评论”. Each comment keeps a stable display number for the browser session; multi-target comments share one number. The menu can locate each target and reopen the shared editor; it does not emit events or modify comments.

For full layout control, use `<FeedbackSurface />` with `<FeedbackSubmitButton />` instead; the button accepts `className` and `children` and defaults to “提交评论”. `FeedbackToolbar` and `FeedbackSurface` also accept `className`. `FeedbackControls` is shorthand for Surface plus Toolbar; do not combine it with another Surface. There is no required header, sidebar, permanent comment list or large editor area. Nested UI components must use the same `TRef` with `useFeedback<TRef>()`.

## Controller and adapters

`useFeedback<TRef>()` exposes:

- `mode`, `value`, `activeAnnotationId`, `selectionTargets`, `submitting`, `error`. `selectionTargets` exposes pending or currently edited targets for custom row/column checkboxes. With a Surface, `toggleTarget` accumulates/removes pending targets until the user opens the shared editor; without one it retains the low-level immediate draft behavior.
- `setMode('browse' | 'select')`, `toggleTarget({ref,text?})`, `createAnnotation(targets, comment?)`.
- `editAnnotation(id | null)`, `updateAnnotation(id, {targets,comment})`, `removeAnnotation(id)`, `setComment(comment)`.
- Async `locate(target)` and `submit()`; handle rejected promises in custom controls. Default controls already present errors.
- `registerText({ref,source,segments})`, returning an unregister function for a component effect.

`createAnnotation`/`updateAnnotation` remain low-level immediate draft operations for custom controls; the supplied contextual editor uses an independent temporary buffer until Save. `editAnnotation(null)` finishes the low-level active entry without deleting it. Normal text selection with a Surface always starts a new comment instead of implicitly appending it to another editor. Keep nonempty target sets; removing the final target removes that entry. Retain annotation IDs when editing a comment.

Without an adapter, mounted objects and registered plain strings can be resolved and located. Pagination, virtualized content and older dynamic snapshots need an adapter:

```ts
type FeedbackAdapter<TRef> = {
  resolve(
    target: FeedbackTarget<TRef>,
  ):
    | { status: 'ready'; text?: string }
    | { status: 'missing' | 'stale'; message: string }
    | Promise<
        { status: 'ready'; text?: string } | { status: 'missing' | 'stale'; message: string }
      >;
  locate(target: FeedbackTarget<TRef>): void | Promise<void>;
  targetRanges?(target: FeedbackTarget<TRef>): readonly Range[];
};
```

`targetRanges` is an optional synchronous geometry bridge for references that do not directly equal a text registration (for example, a selected line interval within one registered diff side). Derive the ranges from the retained source ID, side and exact registered source offsets. Return an empty array when that source/view is not mounted; never search for the first matching quote or reuse an old range on a newer snapshot. Return separate ranges for different scrolling containers. The Surface clips them against their actual scrolling ancestors. This bridge only positions highlights, numbered markers and editors; it does not replace `resolve` validation, create comments, or alter event coordinates.

Here `FeedbackTarget` is the SDK **data type**, not the UI component. `resolve` must return the exact original string when the target has a text range. `locate` restores the appropriate source/view/page before highlighting. A filtered-out item is not automatically stale. Retain old snapshots while feedback refers to them; never apply an old offset to newly fetched text. If the matching source is unavailable, return `missing`/`stale` and preserve the draft. Ignore obsolete async query responses when restoring a view. Unmounting a registration does not delete saved annotations.

## Complex content adapters

Copy the complete skill when reusing these helpers, preserving relative imports. They are skill assets, not extra `paneon/ui` exports:

- [MarkdownFeedback](../assets/shared/markdown-feedback.tsx) takes `source`, `target`, optional `className` and `disabled` inside a `FeedbackProvider<TRef>`. It maps rendered AST text to the full raw Markdown source. `locateMarkdownFeedback(root,text?)` restores source ranges. See [Review](review.md) for mapping, validation and Mermaid boundaries.
- [DiffView](../assets/shared/diff.tsx) takes a `sourceId`, a supplied model or `oldText`/`newText`, optional paths, `fileOnly` and `locateTarget`. It renders both sides and registers exact source coordinates without reading Git itself. Reuse the [diff model](../assets/shared/diff-model.ts) and [schema helpers](../assets/shared/diff-schema.ts); the [Git page](git-review.md) shows source caching, target normalization and validation.

Use these adapters instead of copying the feedback state machine. For another rich renderer, `registerText` accepts `segments: {node: Text, sourceOffsets: (number|null)[]}[]`. Each array has `node.data.length + 1` UTF-16 boundaries pointing into one declared `source`; use null for an unmappable boundary and unregister in effect cleanup. Do not locate repeated words using the first `indexOf` match. Continuous ranges across Markdown formatting can include intervening source syntax; disconnected source ranges become multiple targets. Synthetic controls and diagram interiors remain unregistered.

## Submission and corrections

Editor Save only changes the page draft. “提交评论” is the separate action that submits the whole draft. An unsaved editor blocks submission with an inline prompt to Save or Cancel first; nothing is silently saved or discarded. Explicit pending object selections also require opening “评论” and saving or cancelling before submission; merely copying text does not block submission. Provider freezes one complete result, checks structure and resolves targets, then awaits `onSubmit`. It blocks draft mutation and duplicate submission while pending. On failure, errors are available through the controller/default controls and drafts remain. Show success only after `agent.emit` returns a durable event receipt. An emitted request does not execute the requested operation or wake an ended agent.

Provider does not clear/lock on success, generate `replacesEventId`, store receipts or choose a correction policy. Custom pages own those choices. Supplied standard pages keep a successful result visible, require an explicit edit action, then save a complete correction with `replacesEventId` referencing that browser page's previous successful receipt. Failed saves do not advance it. An empty correction can clear earlier table/review/Git feedback; first empty feedback is rejected. See each page's contract for its result schema.

The skill's [submission helper](../assets/shared/submission.ts) supports this supplied-page policy. Page code still performs semantic validation, declares its event schema and controls success/editing UI; do not swallow an error and present success. Corrected events append history and do not undo an agent's earlier business actions. The agent decides how to reconcile effects already performed.

Drafts and the current receipt live in the browser page; full reload does not promise recovery. Only emitted events are durable. New rounds/questions use new instances; watching TSX does not reload parameter files. [CLI limits](cli.md) apply without truncating feedback.
