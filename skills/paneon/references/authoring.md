# Author custom panels

## Complete source file

```tsx
import { useState } from 'react';
import { agent, definePanel, serverAction, usePanelInput, z } from 'paneon/sdk';
import { Button, Page, Stack } from 'paneon/ui';

export const calculate = serverAction({
  kind: 'query',
  input: z.object({ value: z.number() }),
  handler: async (_ctx, input) => ({ doubled: input.value * 2 }),
});

function Review() {
  const { topic } = usePanelInput<{ topic: string }>();
  const [message, setMessage] = useState('');
  async function runCalculation() {
    try {
      const result = await calculate({ value: 21 });
      setMessage(`Result: ${result.doubled}`);
    } catch {
      setMessage('Calculation failed.');
    }
  }
  async function askAgent() {
    try {
      await agent.emit('review-requested', { topic });
      setMessage('Submitted to AI.');
    } catch {
      setMessage('The request was not saved.');
    }
  }
  return (
    <Page title={topic}>
      <Stack>
        <Button onClick={() => void runCalculation()}>Calculate directly</Button>
        <Button variant="outline" onClick={() => void askAgent()}>
          Ask AI to review
        </Button>
        <p role="status">{message}</p>
      </Stack>
    </Page>
  );
}

export default definePanel({
  id: 'review-panel',
  requires: { paneon: '0.0.0' },
  input: z.object({ topic: z.string() }),
  events: { 'review-requested': z.object({ topic: z.string() }) },
  render: Review,
});
```

```sh
paneon panel run ./review-panel.tsx --cwd "$PWD" --params '{"topic":"Review this proposal"}' --json
```

- `paneon/sdk`, `paneon/ui` and React resolve from Paneon's installation; the source directory needs no npm setup. Other third-party imports must already be resolvable; Paneon never installs them.
- `requires.paneon` must be a literal npm semver range. Paneon never widens it; on `PANEON_VERSION_UNSUPPORTED`, migrate the source or install a compatible Paneon.

## Deliver events

Declare every event type in `events`. `await agent.emit(type, payload)` resolves only after the event is validated and stored; show success only then. It does not wake a stopped agent. A type allows 128 characters and a serialized payload 65536 UTF-16 characters; a complete request over 262144 UTF-8 bytes fails with `BODY_TOO_LARGE`. Never truncate or split a result silently.

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
import { serverAction, z } from 'paneon/sdk';

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
- Restart restores panel configuration and events, not in-flight calls.
- Watching covers local imports and `.env`, `.env.local`, `.env.production` and `.env.production.local`. Run `panel reload` after changing installed packages.

## Queries

`useQuery(queryAction, input, { refreshMs })` returns `{ data, error, loading, refetch }`. It accepts only query actions, avoids overlapping runs, and stops timed refresh on unmount. Build loading, empty, error and success states with ordinary React state:

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
    {items.data?.length === 0 && <p>No matching items.</p>}
    <Button disabled={saving || selectedIds.length === 0} onClick={() => void save()}>
      Save selection
    </Button>
  </Stack>
);
```

## Components

Prefer the existing components over hand-built ones: pages get built faster and stay consistent in style and experience. Import them from `paneon/ui`. They follow upstream shadcn with its default Neutral theme; do not redefine the palette, font scale, radius or control height. Compound components export their parts with the same prefix, such as `Card` with `CardHeader` and `CardContent`.

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
| `CodeBlock` | Highlighted code |
| `Markdown` | GFM Markdown, including Mermaid fences |
| `Mermaid` | Diagram |
| `DiffView` | Text diff |
| `AnnotationRoot`, `AnnotationText`, `AnnotationMenu`, `AnnotationSubmitButton` | Annotations; see [annotations](annotations.md) |

Slider is not included.

- `Select` needs `items` to display labels for values.
- `CodeBlock` highlights javascript/js, typescript/ts, jsx, tsx, json, bash/sh, yaml/yml and diff; other languages render as plain text.
- `Markdown` renders GFM with raw HTML disabled. `components` overrides and `rehypePlugins` compose with the defaults; replacing `pre` also drops Mermaid handling.
- `Mermaid` and Markdown diagrams use the bundled Mermaid library; never load Mermaid from a CDN. Invalid source shows an error in place of that diagram.
- `DiffView` needs no repository: pass `oldText` / `newText`, or a `model` from `createDiffModel` (`paneon/sdk`). Optional `oldPath` / `newPath`, `oldRevision` / `newRevision`, `defaultExpanded` and `onCollapse`. To annotate it, see [annotations](annotations.md#markdown-and-diffview).

## Theme and language

- Public components follow the user's theme and language preference automatically. Never add theme or language to panel input.
- Use theme variables such as `bg-background`, `text-foreground` and `border-border` for custom colors.
- Paneon translates only its own controls; text the page supplies stays as written. `useUI()` returns `theme` and `language` (`en` or `zh-CN`).
- Write a page's own text in the language the human uses with you, not necessarily the one `useUI()` reports: if they asked for Russian, write Russian; if they chat in Japanese, write Japanese. Do not build multilingual copy for a temporary or private page; development time matters more.
