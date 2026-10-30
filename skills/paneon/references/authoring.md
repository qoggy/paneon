# Author custom panels

## Complete source file

```tsx
import { agent, definePanel, serverAction, usePanelInput, z } from '@qoggy/paneon/sdk';
import { Button, Page, Stack, toast } from '@qoggy/paneon/ui';

export const calculate = serverAction({
  kind: 'query',
  input: z.object({ value: z.number() }),
  handler: async (_ctx, input) => ({ doubled: input.value * 2 }),
});

function Review() {
  const { topic } = usePanelInput<{ topic: string }>();
  async function runCalculation() {
    try {
      const result = await calculate({ value: 21 });
      toast.add({ title: `Result: ${result.doubled}`, type: 'success' });
    } catch {
      toast.add({ title: 'Calculation failed.', type: 'error' });
    }
  }
  async function askAgent() {
    try {
      await agent.emit('review-requested', { topic });
      toast.add({ title: 'Submitted to AI.', type: 'success' });
    } catch {
      toast.add({ title: 'The request was not saved.', type: 'error' });
    }
  }
  return (
    <Page title={topic}>
      <Stack>
        <Button onClick={() => void runCalculation()}>Calculate directly</Button>
        <Button variant="outline" onClick={() => void askAgent()}>
          Ask AI to review
        </Button>
      </Stack>
    </Page>
  );
}

export default definePanel({
  id: 'review-panel',
  requires: { paneon: '>=0.0.1 <0.1.0' },
  input: z.object({ topic: z.string() }),
  events: { 'review-requested': z.object({ topic: z.string() }) },
  render: Review,
});
```

```sh
paneon panel run ./review-panel.tsx --cwd "$PWD" --params '{"topic":"Review this proposal"}' --json
```

- `@qoggy/paneon/sdk`, `@qoggy/paneon/ui` and React resolve from Paneon's installation; the source directory needs no npm setup. Other third-party imports must already be resolvable; Paneon never installs them.
- `requires.paneon` is a literal npm semver range that includes the installed CLI, such as `>=0.0.1 <0.1.0`. On `PANEON_VERSION_UNSUPPORTED`, migrate the source or install a compatible Paneon.

## Deliver events

Declare every event type in `events`. `await agent.emit(type, payload)` resolves only after the event is validated and stored; show success only then. A type allows 128 characters and a serialized payload 65536 UTF-16 characters; a complete request over 262144 UTF-8 bytes fails with `BODY_TOO_LARGE`. Never truncate or split a result silently.

## Server actions

- Declare each `serverAction` as a named top-level export. Use `kind: 'query'` for reads and `kind: 'mutation'` (the default) for effects. Inputs and results must be JSON serializable.
- Actions cannot capture render closures or module `let`/`var` bindings; pass page state as input. Imports and pure module-level helpers are fine.
- The action context has no `params`; pass the panel input an action needs as action input.
- Handlers run in Node with the instance's `--cwd`; browser components cannot import Node modules. Paneon provides no `ctx.exec`, task system or business persistence: use `execFile` with argument arrays, `fetch` or ordinary libraries.
- Browser `fetch` works where CORS allows; use a server action for CLI access, server-side credentials or CORS-blocked APIs.
- For a page that needs a token, use a password `Input` and pass its value as ordinary input to a server action. The page and action own its use and storage. Keep it out of action results, agent events and logs; Paneon does not manage or filter secrets.

```ts
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { serverAction, z } from '@qoggy/paneon/sdk';

export const readGitStatus = serverAction({
  kind: 'query',
  input: z.object({}).strict(),
  handler: async (ctx) => {
    const { stdout } = await promisify(execFile)('git', ['status', '--short'], {
      signal: ctx.signal,
    });
    return { status: stdout };
  },
});

export const readApi = serverAction({
  kind: 'query',
  input: z.object({ url: z.url() }).strict(),
  handler: async (ctx, input) => {
    const response = await fetch(input.url, { signal: ctx.signal });
    if (!response.ok) throw new Error('API request failed.');
    return response.json();
  },
});
```

- `ctx.signal` aborts when the instance closes. Timeouts, retries, logs and storage belong to page code.
- An unhandled exception reaches the browser as `ACTION_FAILED`, without its stack.
- Paneon never retries a mutation. A lost connection means the result was not received, not that the operation failed.

## Execution lifetime

- Module-level objects survive between calls only while the panel stays resident. At most ten panels are resident, and idle ones are evicted first; eviction, reload, close and restart discard module state. Keep durable state outside worker memory.
- Await work whose result matters. Detached timers and child processes are not a background-job service.
- When capacity is exhausted, a call can fail with `RUNTIME_BUSY`; it is not replayed.
- Source watching covers local imports and `.env` files; run `panel reload` after changing installed packages.

## Queries

`useQuery(queryAction, input, { refreshMs })` returns `{ data, error, loading, refetch }`. It runs on mount and when `input` changes, never overlaps runs, and accepts only query actions, so automatic refresh never repeats a side effect:

```tsx
// Inside a component; listItems and saveSelection are declared actions.
const items = useQuery(listItems, { filter });
const [saving, setSaving] = useState(false);
const [failure, setFailure] = useState('');

async function save() {
  setSaving(true);
  setFailure('');
  try {
    await saveSelection({ ids: selectedIds });
    await items.refetch();
  } catch {
    setFailure('The selection could not be saved.');
  } finally {
    setSaving(false);
  }
}

return (
  <Stack>
    {items.loading && <Spinner aria-label="Loading items" />}
    {(items.error || failure) && (
      <Alert variant="destructive">
        <AlertTitle>Request failed</AlertTitle>
        <AlertDescription>{failure || 'Unable to read items.'}</AlertDescription>
      </Alert>
    )}
    {items.data?.length === 0 && (
      <Empty>
        <EmptyHeader>
          <EmptyDescription>No matching items.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )}
    <Button disabled={saving || selectedIds.length === 0} onClick={() => void save()}>
      Save selection
    </Button>
  </Stack>
);
```

## Components

Prefer the existing components over hand-built ones: pages get built faster and stay consistent in style and experience. Import them from `@qoggy/paneon/ui`. They follow upstream shadcn with its default Neutral theme; do not redefine the palette, font scale, radius or control height. Compound components export their parts with the same prefix, such as `Card` with `CardHeader` and `CardContent`.

<!-- prettier-ignore -->
| Component | Purpose |
| --- | --- |
| `Page`, `Section`, `Stack` | Page with title, titled region, row/column spacing |
| `Button` | Action button |
| `Input`, `Textarea` | Single-line and multiline text input |
| `Label`, `Field` | Control label; field with description and error |
| `Select` | Dropdown choice |
| `RadioGroup`, `Checkbox`, `Switch` | Single choice, multiple choice, on/off |
| `Card` | Grouped content block |
| `Badge`, `StatusBadge` | Short label or status |
| `Alert` | Inline message |
| `Empty` | Empty state |
| `Spinner` | Loading indicator |
| `toast` | Transient notification: `toast.add({ title, type })` |
| `Table` | Static table |
| `Pagination` | Page navigation |
| `Tabs` | Switch between views |
| `NavigationMenu` | Navigation bar |
| `Accordion`, `Collapsible` | Expandable sections |
| `Dialog`, `AlertDialog` | Modal dialog, confirmation |
| `Sheet` | Side panel |
| `Popover`, `Tooltip` | Floating content, hover hint |
| `DropdownMenu`, `ContextMenu` | Click menu, right-click menu |
| `Separator` | Divider |
| `CodeBlock` | Read-only highlighted code with optional annotations |
| `Markdown` | GFM Markdown, including Mermaid fences |
| `Image` | Remote or local image |
| `Mermaid` | Diagram |
| `DiffView` | Text diff |
| `ResizablePanelGroup`, `ResizablePanel`, `ResizableHandle` | Resizable split layout |
| `Tree` | Expandable hierarchy, such as a file tree |
| `usePageAnnotations`, `AnnotationText`, `useAnnotations` | Annotations; see [annotations](#annotations) |

- `Select` needs `items` to display labels for values.
- `CodeBlock`: `<CodeBlock code={source} language="ts" header="Retry strategy" />`. Only `code` is required. `header` defaults to `true` for the language title; pass a string for a custom title, or `false` to hide the title bar. Use `lineNumbers` when line references help the explanation, or `highlightedLines={{ start: 3, end: 5 }}` to emphasize a range (1-based, both endpoints included). Line numbers default to `false`; wrapping defaults to `true`, with `defaultWrap={false}` for initial horizontal scrolling. To collect feedback on code, see [annotations](#markdown-codeblock-and-diffview).
- `Markdown` renders GFM without raw HTML. Replacing `pre` through `components` also drops Mermaid rendering.
- `Image`: `<Image src="./picture.png" alt="Analysis result" className="max-w-md" />`. Props are `src`, `alt`, optional `sourcePath` and `className`. Local relative paths use `--cwd` or `sourcePath`'s directory, and absolute paths work directly. Markdown images automatically use the same component.
- Links to local files, such as `[retry loop](./src/app.ts#L12-L18)`, open the file read-only with those lines highlighted. Use them in explanations to point at the code being discussed. Relative paths resolve against `--cwd`; when rendering a Markdown file, pass `sourcePath="docs/plan.md"` so its links resolve from that file's directory. Absolute paths and `file://` also work.
- `Mermaid` is bundled; never load Mermaid from a CDN.
- `DiffView` needs no repository: pass `oldText` / `newText`, or a `model` from `createDiffModel` (`@qoggy/paneon/sdk`). Optional `oldPath` / `newPath`, `oldRevision` / `newRevision`, `defaultExpanded` (defaults to `true`) and `onCollapse`. To annotate it, see [annotations](#markdown-codeblock-and-diffview).

## Theme and language

- Public components follow the user's theme and language preference automatically. Never add theme or language to panel input.
- Use theme variables such as `bg-background`, `text-foreground` and `border-border` for custom colors.
- `useUI()` returns `theme` and `language` (`en` or `zh-CN`).
- Write a page's own text in the language the human uses with you, not necessarily the one `useUI()` reports: if they asked for Russian, write Russian; if they chat in Japanese, write Japanese. Do not build multilingual copy for a temporary or private page; development time matters more.

## Annotations

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

- A result is `{annotations: [{id, targets, comment}]}`; there is no page-level comment. A target is `{ref, sourceRef?, text?}`; without `text` it means the whole object. `sourceRef` appears only on [file annotations](#file-annotations).
- Do not build a separate page-level comment editor; an opinion about a whole document is an annotation on its heading.
- `text` is `{start, end, quote}`: UTF-16 offsets into the original string, end excluded, on grapheme boundaries, with `quote === source.slice(start, end)`.
- `ref` is any finite JSON value. For ordinary content use a stable string: `target="redis-plan"` is delivered as `ref: "redis-plan"`. For dynamic content include the source version. Functions, DOM elements and screen coordinates are not references.
- `annotationValueSchema(refSchema)` checks structure only.

### File annotations

When an annotatable `Markdown` links to a local file, the human can annotate the opened file too. Its targets keep that Markdown's `ref` and add `sourceRef: {path, snapshotId}`, with offsets into the file as displayed rather than into the Markdown. Wherever the page checks or maps offsets against its own content, such as an event schema refinement, skip targets with `target.sourceRef !== undefined`.

`sourceRef` is optional JSON; the SDK does not prescribe its structure. `annotationValueSchema(refSchema)` accepts it without widening `refSchema`. Hand-written strict target schemas need to accept the optional field.

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
- `beginAnnotation(targets)` opens the built-in editor for supplied targets, reopening an existing annotation when its targets match. Saving creates or updates the draft; canceling leaves saved annotations unchanged.
- `createAnnotation(targets, comment?)`, `editAnnotation(id | null)`, `updateAnnotation(id, {targets, comment})`, `removeAnnotation(id)`. These change the draft immediately; keep target sets nonempty and IDs stable.
- Async `locate(target)` and `submit()`; handle their rejections in custom controls.
- `registerText({ref, sourceRef?, source, segments, presentation?})`, returning an unregister function for effect cleanup. Optional `presentation(targets)` supplies a summary and editor placement (`anchor: DOMRect`, `side`, `align`); display-only, never submitted.

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

### Markdown, CodeBlock and DiffView

- `<Markdown annotationTarget="plan-a">{source}</Markdown>` registers the document; the target becomes `ref` unchanged. Give each document its own target, even when texts are identical. Offsets address the Markdown source, so a quote can include Markdown syntax, and a selection across separate source fragments becomes several targets.
- `<CodeBlock code={source} language="ts" annotationTarget="example-v1" />` registers the code with the same page session. Offsets address the exact original `code`, including CRLF/CR line endings. Use different targets for distinct snippets, and include a version for changing content.
- `<DiffView oldText="before" newText="after" annotationTargets={{ old: refA, new: refB }} />` registers each side; its reference becomes `ref` unchanged. The two sides need different references. Omit a side to disable annotations on it. Offsets address that side's complete original string.
- With page annotations on, the human can also annotate a whole edit: one annotation with a target on each changed side. Page validation must accept annotations spanning both sides.
- A `DiffViewHandle` ref (`useRef<DiffViewHandle>(null)`) provides `reveal(location)`, which expands context and scrolls once rendered, and `getRanges(location)` for the adapter's `targetRanges`. `DiffLocation` is `{kind: 'text', side, start, end, quote}`, `{kind: 'hunk', index}` (zero-based) or `{kind: 'file'}`; convert the page's own references into it.
- For another renderer, pass `registerText` `segments: {node: Text, sourceOffsets: (number | null)[]}[]`. Each array has `node.data.length + 1` UTF-16 boundaries into one `source`; use `null` for an unmappable boundary.

### Submission

- Paneon checks each target's range against its original text through the adapter or registration before calling `onSubmit`; if either fails, the draft stays.
- Paneon does not clear the draft, generate `replacesEventId` or choose a correction policy. Built-in pages submit each correction as a complete result with `replacesEventId` pointing to the previous one; follow that pattern when a correction should replace an earlier result.
- Drafts live in browser memory, so a reload can lose them. [Event limits](#deliver-events) apply.

## Examples

Each example is a complete custom page. Run it as-is, or read its source to borrow a technique; write new pages on `@qoggy/paneon/sdk` and `@qoggy/paneon/ui` rather than importing from the example. `<skill>` is the absolute path of this skill directory.

### Dining philosophers

[Source](../assets/examples/dining-philosophers/panel.tsx). Compares three fork-acquisition strategies for the dining philosophers problem, one instruction per step.

```sh
paneon panel run <skill>/assets/examples/dining-philosophers/panel.tsx --cwd /work/project --json
```

Borrow: a deterministic page-local state model in plain TypeScript, play/pause/step/timeline controls, an SVG diagram derived from the same state. No input, no events.

### Sentinel LeapArray

[Source](../assets/examples/sentinel-leap-array/panel.tsx). Explains Sentinel's sliding-window `LeapArray` at a pinned commit, replaying requests through its buckets.

```sh
paneon panel run <skill>/assets/examples/sentinel-leap-array/panel.tsx --cwd /work/project --json
```

Borrow: links to real source at a fixed commit, editable scenario parameters validated before applying, a recorded trace replayed with a time slider. No input, no events.

### GitHub PR

[Source](../assets/examples/github-pr/panel.tsx). A read-only workspace for a PR's description, fixed-version diff and checks. Requires an installed and authenticated `gh`.

```sh
paneon panel run <skill>/assets/examples/github-pr/panel.tsx \
  --cwd /work/project --params '{"repository":"cli/cli","initialPullRequest":14768}' --json
```

Input is `{repository: "owner/repo", initialPullRequest?: number}`; without a number it opens the open-PR list. It never publishes to GitHub. It emits `review-requested` (the viewed PR and its fixed base/head commits) and `pr-feedback-submitted` (annotations with their sources); the schemas are in its source.

Borrow: server actions that call a local CLI, list/detail browsing with Tabs, annotations on `Markdown` and `DiffView`, several declared event types.

These examples ship with Chinese and English copy because they are distributed with Paneon; a one-off page usually needs only one language (see [theme and language](#theme-and-language)).
