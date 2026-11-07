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
  requires: { paneon: '>=0.4.0 <0.5.0' },
  input: z.object({ topic: z.string() }),
  render: Review,
});
```

```sh
paneon panel run ./review-panel.tsx --cwd "$PWD" --params '{"topic":"Review this proposal"}' --json
```

- `@qoggy/paneon/sdk`, `@qoggy/paneon/ui` and React resolve from Paneon's installation; the source directory needs no npm setup. Other third-party imports must already be resolvable; Paneon never installs them.
- `requires.paneon` is a literal npm semver range that includes the installed CLI, such as `>=0.4.0 <0.5.0`. On `PANEON_VERSION_UNSUPPORTED`, migrate the source or install a compatible Paneon.

## Deliver events

Call `await agent.emit(type, payload)` to submit JSON feedback; event types need no declaration. Paneon preserves the payload's fields and resolves to `{ id }`, the stored event's numeric ID, only after durable storage; show success only then. A type allows 128 characters and a serialized payload 65536 UTF-16 characters; a complete request over 262144 UTF-8 bytes fails with `BODY_TOO_LARGE`. Never truncate or split a result silently.

## Server actions

- Declare each `serverAction` as a named top-level export. Use `kind: 'query'` for reads and `kind: 'mutation'` (the default) for effects. Inputs and results must be JSON serializable.
- Actions cannot capture render closures or module `let`/`var` bindings; pass page state as input. Imports and pure module-level helpers are fine.
- The action context has no `params`; pass the panel input an action needs as action input.
- Handlers run in Node with the instance's `--cwd`; browser components cannot import Node modules. Use `execFile` with argument arrays rather than a shell.
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

- `ctx.signal` aborts when the instance closes.
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
// Inside a component; listItems is a query action, saveSelection a mutation.
const items = useQuery(listItems, { filter });

async function save() {
  try {
    await saveSelection({ ids: selectedIds });
    await items.refetch();
  } catch {
    toast.add({ title: 'The selection could not be saved.', type: 'error' });
  }
}

if (items.loading) return <Spinner aria-label="Loading items" />;
if (items.error)
  return (
    <Alert variant="destructive">
      <AlertTitle>Unable to read items</AlertTitle>
    </Alert>
  );
if (items.data?.length === 0)
  return (
    <Empty>
      <EmptyHeader>
        <EmptyDescription>No matching items.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
return <Button onClick={() => void save()}>Save selection</Button>;
```

## Components

Prefer the existing components over hand-built ones: pages get built faster and stay consistent in style and experience. Import them from `@qoggy/paneon/ui`. They follow upstream shadcn with its default Neutral theme; do not redefine the palette, font scale, radius or control height. Compound components export their parts with the same prefix, such as `Card` with `CardHeader` and `CardContent`.

Find a component in the [component index](components/index.md), then read its file for the import statement and common props. Annotation APIs are described [below](#annotations).

- Links to local files, such as `[retry loop](./src/app.ts#L12-L18)`, open the file read-only with those lines highlighted. Use them in explanations to point at the code being discussed. Relative paths resolve against `--cwd`; when rendering a Markdown file, pass `sourcePath="docs/plan.md"` so its links resolve from that file's directory. Absolute paths and `file://` also work.

## Theme and language

- Public components follow the user's theme and language preference automatically. Never add theme or language to panel input.
- Use theme variables such as `bg-background`, `text-foreground` and `border-border` for custom colors.
- `useUI()` returns `theme` and `language` (`en` or `zh-CN`).
- Write a page's own text in the language the human uses with you, not necessarily the one `useUI()` reports: if they asked for Russian, write Russian; if they chat in Japanese, write Japanese. Do not build multilingual copy for a temporary or private page; development time matters more.

## Annotations

Import annotation data types and optional `annotationValueSchema` from `@qoggy/paneon/sdk`; import components, `useAnnotations` and `AnnotationAdapter` from `@qoggy/paneon/ui`. Call the feature 批注 in Chinese copy and annotation in English copy.

### Complete annotation panel

```tsx
import { agent, definePanel, z } from '@qoggy/paneon/sdk';
import { Card, AnnotationText, toast, usePageAnnotations } from '@qoggy/paneon/ui';

const source = 'Use Redis for shared cache storage.';
type Ref = 'redis-plan';

function Panel() {
  usePageAnnotations<Ref>({
    onSubmit: async (value) => {
      await agent.emit('annotations-submitted', {
        annotations: value.annotations.map(({ targets, comment }) => ({ targets, comment })),
      });
      toast.add({ title: 'Annotations submitted.', type: 'success' });
    },
  });
  return (
    <Card className="p-4">
      <AnnotationText target="redis-plan">{source}</AnnotationText>
    </Card>
  );
}

export default definePanel({
  id: 'custom-annotations',
  requires: { paneon: '>=0.4.0 <0.5.0' },
  input: z.object({}).strict(),
  render: Panel,
});
```

### Result data

- `onSubmit` receives the editable draft `{annotations: [{id, targets, comment}]}`. `id` only identifies drafts on the page; leave it out of the event, as the example does. There is no page-level comment; an opinion about a whole document is an annotation on its heading or on the [picked element](#element-annotations). A target is `{ref, src?, sourceRef?, type?, text?}`; without `text` it means the whole object. `sourceRef` appears only on [file annotations](#file-annotations).
- `text` is `{start, end, quote}`: original-source UTF-16 offsets on grapheme boundaries, end excluded, and the selected text in `quote`. Mermaid targets have `type: 'mermaid'` and optional `text: {start, end}`.
- `ref` is a finite JSON value identifying the annotated content, such as `"redis-plan"`. Include state or version when content changes, such as ``annotationTarget={`result-${env}`}``. Use an [adapter](#adapters) to locate a saved version.
- `annotationValueSchema(refSchema)` is available for page-owned draft validation and accepts [element targets](#element-annotations) beside the page's own refs. `onSubmit` and `useAnnotations<TRef>()` values include `ElementAnnotationRef`; check `isElementAnnotationRef(target.ref)` before reading a ref as the page's own.

### Element annotations

`usePageAnnotations` also lets the human pick any rendered element, such as an SVG diagram, a card or a step view, and annotate it as a whole. The element needs no registration; its target is `{ref: {element: {path, tag, excerpt}}}` without `text`.

`excerpt` is the element's `aria-label`, otherwise its text, captured when the human picks it and cut to 30 characters. Graphics and state-dependent views often carry little or no text: give them a short `aria-label` that starts with the current state, such as ``aria-label={`Step ${step} · forks`}``, so the agent can tell what was picked.

### File annotations

When an annotatable `Markdown` links to a local file, the human can annotate the opened file too. Its targets keep that Markdown's `ref` and add `sourceRef: {path, snapshotId}`; text offsets refer to the file as displayed, not to the Markdown.

`sourceRef` is optional JSON; the SDK does not prescribe its structure. `annotationValueSchema(refSchema)` accepts it without widening `refSchema`. Hand-written strict target schemas need to accept the optional field.

### Annotation components

- `usePageAnnotations<TRef>({ onSubmit, adapter?, disabled?, allowEmptySubmit?, onRequestEdit? })` turns on annotations for the page: Paneon supplies the editor and a floating annotation list with the submit action. Call it once in the page component; nested components read the state with `useAnnotations`.
- `onSubmit` receives the complete annotation list; the page emits the event itself.
- `adapter` is needed to locate content the page may not be displaying; see [adapters](#adapters).
- `disabled` blocks editing and submission while saved annotations stay readable. To lock feedback after a successful submission, set `disabled` and pass `onRequestEdit`, which the list offers as a correction action that should unlock editing.
- `allowEmptySubmit` (default `false`) permits submitting an empty list, such as a correction that withdraws all feedback.
- `AnnotationText` takes `target`, plain-string `children` and optional `className`. It makes plain text annotatable by exact range; other content can still be [picked as a whole](#element-annotations).
- Add `annotationTarget="api"` to `Page` or `Section` to annotate its title and description; refs are `{id: "api", field: "title" | "description"}`, with `id` holding the given reference unchanged. Content inside uses its own targets.

### Controller

`useAnnotations<TRef>()` exposes:

- `value`, `activeAnnotationId`, `selectionTargets`, `submitting`, `error`.
- `beginAnnotation(targets)` opens the built-in editor for supplied targets, reopening an existing annotation when its targets match. Saving creates or updates the draft; canceling leaves saved annotations unchanged.
- `createAnnotation(targets, comment?)`, `editAnnotation(id | null)`, `updateAnnotation(id, {targets, comment})`, `removeAnnotation(id)`. These change the draft immediately; keep target sets nonempty and IDs stable.
- Async `locate(target)` and `submit()`; handle their rejections in custom controls.
- `registerText({ref, sourceRef?, source, segments, presentation?})`, returning an unregister function for effect cleanup. Optional `presentation(targets)` supplies a summary and editor placement (`anchor: DOMRect`, `side`, `align`); display-only, never submitted.

### Adapters

Without an adapter, registered text can be located only while it is mounted. Content that unmounts, such as an inactive `Tabs` panel, a closed `Accordion`, `Collapsible` or `Dialog`, or conditional rendering, still submits, but locating its annotations fails unless an adapter's `locate` switches back to that view. Paginated, virtualized or versioned source content needs an adapter as well. The adapter only restores the view. Paneon retains registered source text and handles validation, text geometry and highlighting. Element targets and linked-file targets (with `sourceRef`) are handled by Paneon itself:

```tsx
// Each Tabs value is also the annotation ref of the Markdown rendered in that panel.
const [tab, setTab] = useState('plan');
const adapter = useMemo<AnnotationAdapter<string>>(
  () => ({
    async locate(target) {
      setTab(target.ref);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    },
  }),
  [],
);
usePageAnnotations({ adapter, onSubmit });
```

The full type:

```ts
type AnnotationAdapter<TRef> = {
  locate(target: AnnotationTarget<TRef>): void | Promise<void>;
};
```

- `locate` restores the right page or view before highlighting. Ignore obsolete async responses.

### Markdown, CodeBlock and DiffView

- `<Markdown annotationTarget="plan-a">{source}</Markdown>` registers the document; the target becomes `ref` unchanged. Give each document its own target, even when texts are identical. Offsets address the Markdown source, so a quote can include Markdown syntax, and a selection across separate source fragments becomes several targets.
- `<CodeBlock code={source} language="ts" annotationTarget="example-v1" />` registers the code with the same page session. Offsets address the exact original `code`, including CRLF/CR line endings. Use different targets for distinct snippets, and include a version for changing content.
- `<DiffView oldText="before" newText="after" annotationTargets={{ old: refA, new: refB }} />` registers each side; its reference becomes `ref` unchanged. The two sides need different references. Omit a side to disable annotations on it. Offsets address that side's complete original string.
- With page annotations on, the human can also annotate a whole edit: one annotation with a target on each changed side.
- A `DiffViewHandle` ref (`useRef<DiffViewHandle>(null)`) provides `reveal(location)`, which expands context and scrolls once rendered, and `getRanges(location)`, which returns DOM ranges for a location. `DiffLocation` is `{kind: 'text', side, start, end, quote}`, `{kind: 'hunk', index}` (zero-based) or `{kind: 'file'}`; convert the page's own references into it.
- For another renderer, pass `registerText` `segments: {node: Text, sourceOffsets: (number | null)[]}[]`. Each array has `node.data.length + 1` UTF-16 boundaries into one `source`; use `null` for an unmappable boundary.

### Image and Mermaid

- `<Image annotationTarget="checkout-screen" … />` and `<Mermaid annotationTarget="flow-v1" … />` register the whole image or diagram; the reference becomes `ref` unchanged, without `text`. An Image target also has its `src` prop as written, such as `{ref: 'checkout-screen', src: './screen.svg'}`; a Mermaid target has `type: 'mermaid'`.
- Inside an annotatable `Markdown`, images and Mermaid fences use the document's `ref`. An image target's `text` covers its image syntax, with `quote`; a Mermaid target has `type: 'mermaid'` and `text` covering the whole fence, without `quote`. Identical occurrences differ by range.
- Replacing `img` or `pre` through `Markdown` `components` drops these annotations for them.

### Submission

- Explicit submission passes the complete saved annotations to `onSubmit`; a failed submission retains the draft for retry.
- To replace an earlier result, emit the complete corrected result with `replacesEventId` set to the `id` that the earlier `agent.emit` returned, as built-in pages do. The draft is not cleared after submission.
- Drafts live in browser memory, so a reload can lose them. [Event limits](#deliver-events) apply.

## Examples

Each example is a complete custom page. Run it as-is, or read its source to borrow a technique.

### Dining philosophers

[Source](../assets/examples/dining-philosophers/panel.tsx). Compares three fork-acquisition strategies for the dining philosophers problem, one instruction per step.

```sh
paneon panel run <skill>/assets/examples/dining-philosophers/panel.tsx --cwd /work/project --json
```

Borrow: a deterministic page-local state model in plain TypeScript, play/pause/step/timeline controls, an SVG diagram derived from the same state, and `aria-label`s that carry the strategy and step, so element annotations tell the agent what the human saw. No input. It emits `annotations-submitted` with element annotations; a resubmission carries `replacesEventId`.

### Sentinel LeapArray

[Source](../assets/examples/sentinel-leap-array/panel.tsx). Explains Sentinel's sliding-window `LeapArray` at a pinned commit, replaying requests through its buckets.

```sh
paneon panel run <skill>/assets/examples/sentinel-leap-array/panel.tsx --cwd /work/project --json
```

Borrow: links to real source at a fixed commit, editable scenario parameters validated before applying, a recorded trace replayed with a time slider. No input. It emits `annotations-submitted` like the dining philosophers example.

### GitHub PR

[Source](../assets/examples/github-pr/panel.tsx). A read-only workspace for a PR's description, fixed-version diff and checks. Requires an installed and authenticated `gh`.

```sh
paneon panel run <skill>/assets/examples/github-pr/panel.tsx \
  --cwd /work/project --params '{"repository":"cli/cli","initialPullRequest":14768}' --json
```

Input is `{repository: "owner/repo", initialPullRequest?: number}`; without a number it opens the open-PR list. It never publishes to GitHub. It emits `review-requested` (the viewed PR and its fixed base/head commits) and `pr-feedback-submitted` (annotations with their sources); the schemas are in its source.

Borrow: server actions that call a local CLI, list/detail browsing with Tabs, annotations on `Markdown` and `DiffView`, and several event types sent with `agent.emit`.

These examples ship with Chinese and English copy because they are distributed with Paneon; a one-off page usually needs only one language (see [theme and language](#theme-and-language)).
