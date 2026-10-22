# Author custom panels

Use the [built-in pages](../SKILL.md#built-in-pages) first. Standard pages take data without new TSX. Write source when the interaction is genuinely custom, or adapt the [one-off explanatory examples](examples.md). Copy the **complete skill directory** before changing its resources so relative shared imports stay available. Keep unmodified resources from the same CLI release; `requires.paneon` is described in [CLI compatibility](cli.md#declare-compatibility).

## Start with a complete source file

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

Save this as `review-panel.tsx`, then run:

```sh
paneon panel run ./review-panel.tsx --cwd "$PWD" --params '{"topic":"Review this proposal"}' --json
```

The source's `id` becomes `definitionId`. Paneon creates a separate `instanceId`
for each run. Keep the returned instance ID for later commands. Built-in SDK,
React, and UI imports resolve from Paneon's installation; the source directory
does not require npm initialization. Relative TypeScript modules are reusable.
Other third-party imports must already be resolvable; Paneon never installs them
implicitly.

## Write local functions, not adapters

Declare each `serverAction` as a named top-level export. Use `kind: 'query'` for
reads and `kind: 'mutation'` for effects; mutation is the default. Inputs and
results must be JSON serializable. Pass page state explicitly as input; actions
cannot capture render closures or mutable module state. Explicit imports and
pure module-level helpers are supported.

The compiler separates browser components from Node handlers. A handler may use
Node's `execFile`, `fetch`, or ordinary libraries. A browser component may not
import Node modules or access a handler directly. Put tool-specific code in your own modules, using argument arrays for CLI calls and intentional request/response shapes for HTTP calls. Paneon provides no `ctx.exec`, task system,
CLI adapter protocol, business logs, or business persistence.

For example, these named actions can live alongside a custom panel. Call them from a click handler or `useQuery`; Node imports remain on the server:

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

`readGitStatus` uses the instance's `--cwd`. The page owns API authorization, allowed endpoints and result validation. Ordinary browser fetch works when the API permits it; use `serverAction` for Node/CLI access, server-side credentials or APIs unavailable to the browser under CORS. JSON OpenAPI calls need no special Paneon integration protocol.

`ctx.signal` supports cooperative cleanup when an instance closes. Author code
owns timeout handling, retries, process cleanup, business status, scheduling,
monitoring, logs, and storage. Business stdout/stderr is not forwarded as
framework diagnostics. Return intentional displayable results. Unhandled
exceptions become `ACTION_FAILED` without exposing original stacks.

A lost connection means the result was not received, not that the external
operation failed. Paneon never automatically retries a mutation or promises
business idempotency. Restart restores panel configuration and events, not an
in-flight call or its business result.

## Queries and complete interface states

`useQuery(queryAction, input, { refreshMs })` returns
`{ data, error, loading, refetch }`. It accepts only query actions, keeps results
in page memory, avoids overlapping runs for that subscription, and stops timed
refresh when unsubscribed. Refresh is optional and does not create a business
monitoring history.

Use ordinary React state and components for loading, empty, error, disabled, and
success states. Do not invent a separate state protocol:

```tsx
// Inside a component; listItems and saveSelection are declared actions.
const items = useQuery(listItems, { filter });
const [saving, setSaving] = useState(false);
const [saved, setSaved] = useState(false);
const [failure, setFailure] = useState('');

async function save() {
  setSaving(true);
  setSaved(false);
  setFailure('');
  try {
    await saveSelection({ ids: selectedIds }); // top-level mutation action
    setSaved(true);
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
    {saved && <p role="status">Selection saved.</p>}
  </Stack>
);
```

For an existing interaction, reuse the [form](form.md), [table](table.md), or [choice](choose.md) page. In custom layouts, label fields, connect descriptions/errors with `aria-describedby`, mark invalid controls with `aria-invalid`, and handle empty results and disabled actions explicitly.

## Available components

Import these from `paneon/ui`. Base APIs and composition follow the pinned
upstream shadcn implementation and its default Neutral theme. You do not need to
copy component implementations or define another palette, font scale, corner
radius, or control height. `Page`, `Section`, and `Stack` only supply layout.
`StatusBadge` reuses `Badge`; it does not inspect business status.

<!-- prettier-ignore -->
| Main component(s) | Companion exports |
| --- | --- |
| `Page`, `Section`, `Stack` | Page/section title and description; Stack direction, gap, and wrapping |
| `Button` | Standard button props, variants, size, `asChild` |
| `Input`, `Label` | Standard input and label composition |
| `Field` | `FieldContent`, `FieldLabel`, `FieldTitle`, `FieldDescription`, `FieldError`, `FieldGroup`, `FieldSet`, `FieldLegend`, `FieldSeparator` |
| `Card` | `CardHeader`, `CardTitle`, `CardDescription`, `CardAction`, `CardContent`, `CardFooter` |
| `RadioGroup`, `Checkbox` | `RadioGroupItem`; controlled/uncontrolled values |
| `Textarea` | Standard multiline input props |
| `Select` | `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectItem`, `SelectGroup`, `SelectLabel`, `SelectSeparator` |
| `Badge`, `StatusBadge` | Same badge variants; author supplies content |
| `Alert`, `Spinner` | `AlertTitle`, `AlertDescription`; accessible loading label |
| `Table` | `TableHeader`, `TableBody`, `TableFooter`, `TableRow`, `TableHead`, `TableCell`, `TableCaption` |
| `Pagination` | `PaginationContent`, `PaginationItem`, `PaginationLink`, `PaginationPrevious`, `PaginationNext`, `PaginationEllipsis` |
| `Tabs` | `TabsList`, `TabsTrigger`, `TabsContent` |
| `Dialog` | `DialogTrigger`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter`, `DialogClose` |
| `AlertDialog` | `AlertDialogTrigger`, `AlertDialogContent`, `AlertDialogHeader`, `AlertDialogTitle`, `AlertDialogDescription`, `AlertDialogFooter`, `AlertDialogAction`, `AlertDialogCancel` |
| `Accordion` | `AccordionItem`, `AccordionTrigger`, `AccordionContent` |
| `Collapsible` | `CollapsibleTrigger`, `CollapsibleContent` |
| `Tooltip` | `TooltipProvider`, `TooltipTrigger`, `TooltipContent`; provider is also installed in the panel root |
| `DropdownMenu` | `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuGroup`, `DropdownMenuLabel`, `DropdownMenuItem`, `DropdownMenuSeparator`, `DropdownMenuShortcut`, `DropdownMenuCheckboxItem`, `DropdownMenuRadioGroup`, `DropdownMenuRadioItem`, `DropdownMenuSub`, `DropdownMenuSubTrigger`, `DropdownMenuSubContent` |
| `Popover` | `PopoverTrigger`, `PopoverContent`, `PopoverAnchor` |
| `Switch` | Controlled/uncontrolled boolean control |
| `CodeBlock` | `code: string`, optional `language` |
| `Markdown` | Markdown string as children, including fenced Mermaid diagrams |
| `Mermaid` | `code: string`, optional `className` |

Companion exports belong to their main component families. Slider is not included.

For basic layout, use `<Page title="..."><Stack>...</Stack></Page>`, add
`<Section title="...">` for a region, and use
`<Stack direction="row" wrap>` for controls. Compose upstream Card and Field
families for structure. Input values, validation, modal confirmation, and actions
remain explicit author code. Merely opening a dialog or changing a switch does
not automatically send events or execute functions.

Label controls and provide dialog titles and descriptions. For reusable selection and annotations, see [Feedback](feedback.md); no fixed header, sidebar or page layout is required.

CodeBlock uses bundled Shiki JavaScript highlighting for javascript/js,
typescript/ts, jsx, tsx, json, bash/sh, yaml/yml, and diff. Unknown or absent
languages are plain text. The content is read-only and never executed.

Markdown uses `react-markdown` + `remark-gfm` and the community-maintained
`github-markdown-css` light stylesheet in a scoped container. It renders GFM
tables, strikethrough, read-only task lists, and automatic links. Raw HTML parsing
is disabled by default. It is a read-only renderer. To collect exact document feedback, reuse the [Markdown adapter](feedback.md#complex-content-adapters). Styles are loaded inside the panel iframe.

Trusted TSX can pass `components` overrides and `rehypePlugins`. They compose with the default renderers; replacing `pre` explicitly also replaces its Mermaid handling. For example:

```tsx
import { Markdown } from 'paneon/ui';

<Markdown components={{ h2: ({ node: _node, ...props }) => <h2 {...props} data-section="true" /> }}>
  {'## Options\n\nCompare the tradeoffs.'}
</Markdown>;
```

Use `rehypePlugins` for trusted AST transforms such as source mapping; it is not data supplied by a human or agent through JSON params. Raw HTML parsing stays disabled by default.

### Mermaid diagrams

Use `Mermaid` for a standalone diagram, or a `mermaid` fenced block inside
`Markdown`. Both entry points use the official Mermaid library, bundled locally,
and keep its default appearance. Do not load Mermaid from a CDN or add a separate
rendering service.

```tsx
import { Markdown, Mermaid } from 'paneon/ui';

<Mermaid code={'flowchart LR\n  Question --> Explanation'} />;

<Markdown>{`## Review flow

\`\`\`mermaid
sequenceDiagram
  Human->>Agent: Ask a question
  Agent-->>Human: Explain the options
\`\`\`
`}</Markdown>;
```

The `code` prop is ordinary React state: changing it renders the new source.
Multiple diagrams can appear in the same document, including lists and quotes.
While rendering, the component shows a loading state; invalid source displays an
error in that diagram and can be corrected without reloading the page. Other
Markdown code blocks, inline code, and GFM content retain their existing behavior.
Raw HTML parsing stays disabled. The optional `className` is for container layout,
not a separate diagram theme API.

## Temporary credential input

For a function that needs a temporary credential, declare its purpose and use
the host's input dialog. Import `credentials` from `paneon/sdk`. The panel and CLI receive only a reference. In this fragment, `businessClient` is your own imported server-side client:

```tsx
export const authenticate = serverAction({
  kind: 'mutation',
  credential: { label: 'Use the token for this operation', ttlSeconds: 900 },
  input: z.object({ credential: z.string() }),
  handler: async (ctx, input) =>
    ctx.secrets.use(input.credential, async (value) => {
      // Trusted author code uses value with its own library or HTTP client.
      await businessClient.authenticate(value);
      return { authenticated: true };
    }),
});

// In a click handler, with normal pending/error feedback:
const reference = await credentials.request(authenticate);
await authenticate({ credential: reference.ref });
```

The trusted dialog is outside the panel iframe and shows the declared purpose,
action, and revision. References are bound to that instance/revision/action.
Default lifetime is 15 minutes; the maximum is 60 minutes. Expiry, revocation,
reload, close, or service stop prevents new use. Restart requires fresh input.
No browser or CLI API dereferences a credential.

The raw value reaches **trusted server-side author code** in its callback. The
runtime keeps credentials in memory and blocks known raw values in its own
action-result, event, and diagnostic boundaries (`SECRET_OUTPUT_BLOCKED`). It
does not identify every possible encoding, control arbitrary code, erase copies
already made by that code, or intercept business HTTP, child processes, files,
or logs. The author is responsible for those outputs. Never describe this as
protection against malicious author code or another program with the same OS
user's debugging/shell access.

## Theme and language

Public UI components inherit user preferences automatically; do not add theme or
language to the panel input schema. `useUI()` from `paneon/ui` exposes `theme`,
`language`, and typed public-component translations. Use theme variables for
custom colors. Author-supplied text and input are preserved. For optional custom
copy selection and compatibility boundaries, see [interface preferences](preferences.md).
