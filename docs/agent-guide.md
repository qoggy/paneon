# Authoring Paneon interfaces

Paneon is a CLI-first local runtime for TypeScript and React panels. Use code to
present information, collect human decisions, and bind controls to local
functions. Use `paneon --help`, `paneon panel --help`, and individual command help
to discover the installed interface. CLI-generated text is English; user data
and the panel's own language are preserved.

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

## Declare compatibility

Node.js 24 is required. CLI, SDK, UI, compiler, and local service share the same
package version. Declare a literal npm semver range in `requires.paneon`. Current
examples intentionally use the actual development version `0.0.0`, not a future
version. Do not assume all `0.x` interfaces are compatible.

Paneon checks the range before executing source modules, then type-checks and
builds the panel. A matching range does not prove your code uses valid APIs.
`INVALID_PANEON_REQUIREMENT` means the declaration is missing, invalid, or dynamic;
`PANEON_VERSION_UNSUPPORTED` includes the required range, installed version, and
entry path. Migrate the source or deliberately install a compatible package.
Paneon does not widen the range, download an older SDK, or rewrite the source.

After upgrading the package, an older running server produces
`RUNTIME_VERSION_MISMATCH`. Explicitly stop it with `paneon server stop`, then run
the panel with the installed version. Saved compatible instances are rebuilt;
incompatible instances remain `unavailable` with their events intact.

## CLI commands

All operational commands accept `--json` and `--debug`. With `--json`, stdout
contains one result envelope: `{ "ok": true, "data": ... }` or
`{ "ok": false, "error": { "code": "...", "message": "..." } }`.
Failures exit with code 1; a successful empty read or wait timeout exits with 0.
Use readable field names; do not parse human-readable output as a protocol.

<!-- prettier-ignore -->
| Command | Inputs | Successful data |
| --- | --- | --- |
| `panel run <entry.tsx>` | Required `--cwd <directory>` and `--params '<json>'`; optional `--watch` / `--no-watch`, `--open` | `instanceId`, `definitionId`, `status`, `revision`, `watch`, `paneonVersion`, `url` |
| `panel list` | Optional `--page <number>` (default 1), `--page-size <count>` (default 20, 1–1000) | `panels`: instance metadata; `page`, `pageSize`, `total`, `totalPages` |
| `panel inspect <instance-id>` | Existing instance ID | Complete instance details, saved params, requires, build version, current URL, and optional diagnostic |
| `panel reload <instance-id>` | Existing instance ID | `previousRevision`, `revision`, `changed`, `watch` |
| `panel close <instance-id>` | Existing instance ID | `status: "closed"`, `alreadyClosed` |
| `panel events <instance-id>` | Required `--consumer <name>`; optional `--wait-ms <ms>` and `--limit <count>` | `events`, `lastAckId`, `lastDeliveredId`, `hasMore`, `timedOut` |
| `panel ack <instance-id>` | Required `--consumer <name>` and `--through <event-id>` | `lastAckId` |
| `server status` | None | `running`, `runtime` (identity, PID, host, port, package/protocol versions, start time), or `runtime: null` |
| `server stop` | None | `stopped`, `alreadyStopped`, `runtimeId` |

`panel list` returns one page in ascending creation-time/instance-ID order. For example,
`paneon panel list --page 2 --page-size 20 --json` reads the second page.
An out-of-range page returns no instances; an empty collection has `totalPages: 0`.
The browser panel list also starts on page 1 with 20 instances per page.

`panel run` resolves source and cwd against the invoking CLI's directory. `--cwd`
is the author code's working directory, independently of where the TSX file
lives. `--params` must satisfy the input schema; pass `'{}'` for an empty object.
`--open` requests the system browser; otherwise open the returned URL yourself.
Only `panel run` automatically starts a server. `server status` does not start
one, and stopping an already stopped server is successful.

Example creation result (IDs and revisions are illustrative):

```json
{
  "ok": true,
  "data": {
    "instanceId": "instance-example",
    "definitionId": "review-panel",
    "status": "running",
    "revision": "sha256:example",
    "watch": true,
    "paneonVersion": "0.0.0",
    "url": "http://127.0.0.1:42173/panels/instance-example"
  }
}
```

Results omit redundant echoes of supplied instance IDs and consumer names when
appropriate. Complete models and metadata remain available through `inspect`.
An empty event read retains useful consumption and timeout information:

```json
{
  "ok": true,
  "data": {
    "events": [],
    "lastAckId": 42,
    "lastDeliveredId": 42,
    "hasMore": false,
    "timedOut": true
  }
}
```

## Panel lifecycle and source updates

A panel is independent of your agent process and browser tab. `panel close`
releases one instance; `server stop` stops the service. Source and saved events
remain. These commands do not guarantee cancellation of external business effects.

Source watching is enabled by default. Choose `--no-watch` for a stable view,
or `--watch` explicitly. Saving source or its local dependencies uses the
Vite/React update mechanisms. Manual `panel reload` works in either mode and
does not change that mode. Failed builds retain the previous usable revision.
Fix the source and reload or let watching pick up the correction.

Reload may reset unsubmitted React state and displayed function results. Paneon
does not maintain old execution environments to guarantee in-flight completion
and does not automatically retry a mutation. An old-page call can return
`PANEL_REVISION_MISMATCH`; refresh and let the human decide what to do again.

Use `panel inspect <instance-id>` to reopen an existing panel. It returns an
ordinary reusable local URL, without login or expiration. Inspect does not
create another instance, reload source, run a business function, or reopen a
closed panel. After service restart, obtain its current URL using inspect.

## Write local functions, not adapters

Declare each `serverAction` as a named top-level export. Use `kind: 'query'` for
reads and `kind: 'mutation'` for effects; mutation is the default. Inputs and
results must be JSON serializable. Pass page state explicitly as input; actions
cannot capture render closures or mutable module state. Explicit imports and
pure module-level helpers are supported.

The compiler separates browser components from Node handlers. A handler may use
Node's `execFile`, `fetch`, or ordinary libraries. A browser component may not
import Node modules or access a handler directly. Put tool-specific code in your
own modules, as in [the CLI example](../examples/business.ts) and
[the gh example](../examples/github.ts). Paneon provides no `ctx.exec`, task system,
CLI adapter protocol, business logs, or business persistence.

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
const items = useQuery(listItems, { filter }); // listItems is a query action
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

The [form](../examples/form-panel.tsx), [table](../examples/table-panel.tsx),
[decision](../examples/decision-panel.tsx), and [CLI](../examples/release-panel.tsx)
examples are complete files to copy and modify. The form demonstrates labels,
descriptions, `aria-invalid` / `aria-describedby`, author validation, and disabled
submission. Table pagination uses author-owned state and prevents ordinary link
navigation; handle first/last, empty, and single-page cases explicitly.

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

[The component gallery](../examples/components-panel.tsx) shows every family:
Tabs, cards and radio choices, Accordion/Collapsible explanations,
Dialog/AlertDialog, Tooltip, DropdownMenu choices and submenus, Popover forms,
Field error associations, table pagination, and status feedback. Use the same
controlled/uncontrolled APIs for your own combinations. Explicitly label inputs
and provide dialog titles and descriptions.

CodeBlock uses bundled Shiki JavaScript highlighting for javascript/js,
typescript/ts, jsx, tsx, json, bash/sh, yaml/yml, and diff. Unknown or absent
languages are plain text. The content is read-only and never executed.

Markdown uses `react-markdown` + `remark-gfm` and the community-maintained
`github-markdown-css` light stylesheet in a scoped container. It renders GFM
tables, strikethrough, read-only task lists, and automatic links. Raw HTML parsing
is disabled by default. It is a read-only renderer, not an editor or annotation
system. Host styles are loaded separately inside the iframe.

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

[The Mermaid example](../examples/mermaid-panel.tsx) provides editable source,
flowchart and sequence presets, Markdown diagrams, and error recovery:

```sh
paneon panel run examples/mermaid-panel.tsx --cwd "$PWD" --params '{}' --open --json
```

## Deliver events to the agent

Declare allowed event types in `definePanel.events`. `await agent.emit(type,
payload)` resolves only after validation and durable storage; only then show
“Submitted to AI.” It does not execute the described business operation or wake
a stopped agent. Human text and JSON payloads are preserved as supplied.

```sh
paneon panel events <instance-id> --consumer assistant --wait-ms 30000 --limit 100 --json
```

Choose a stable consumer name; `assistant` is just a name, not an agent vendor or
special mode. Names have independent positions. The same instance/name resumes
its previous position across processes and sessions. First read creates the
consumer. Events include `id`, `type`, `payload`, `revision`, and `createdAt` in ID
order. `--limit` defaults to 100, range 1–1000. `--wait-ms` is milliseconds,
default 0, range 0–60000. Empty reads and wait timeouts are successful.

Reading **does not acknowledge**. Finish handling every event up to the chosen
ID before running:

```sh
paneon panel ack <instance-id> --consumer assistant --through 42 --json
```

`--through` acknowledges a range, not just one record. It must belong to this
instance, already have been delivered, and not move backward. Unacknowledged
events are redelivered. Another consumer is unaffected. Delivery is at least
once; external business effects and acknowledgements are not one transaction.

When the agent stops, the person can keep using the page. When manually resumed,
the agent reads using the same consumer and explicitly acknowledges handled
requests. No vendor-specific session or automatic-wakeup integration is needed.

## Temporary credential input

For a function that needs a temporary credential, declare its purpose and use
the host's input dialog. The panel and CLI receive only a reference:

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

## Framework diagnostics

```sh
paneon --debug panel inspect <instance-id> --json
paneon panel inspect <instance-id> --json --debug
```

Both forms enable current-call English `[debug]` lines on stderr. JSON stdout,
exit codes, and event semantics do not change. The flag is not persisted and
does not enable ongoing background logs or business log capture. Necessary
errors remain visible without debugging. Framework diagnostics do not dump
request bodies, source, environment values, credentials, or handler stacks.

For `INPUT_VALIDATION_FAILED`, compare params to the input schema. For
`BUILD_FAILED` or `UNSUPPORTED_ACTION_CAPTURE`, use the source position to fix the
code; do not bypass the compiler boundary. For `SERVER_NOT_RUNNING`, start an
instance with `panel run`. Use `inspect` for the current revision and diagnostic.
A closed instance cannot be reloaded; run its source to create a fresh instance.

`BUILD_SOURCE_CHANGED` means a source file changed during compilation. Paneon
discards that build and keeps the previous working revision. Watched source
changes use the existing Vite update flow; in manual mode, reload the latest source.

## Repeatable acceptance

After the normal build and checks, run the browser acceptance against the built
repository CLI:

```sh
npm run test:acceptance
npm run test:versions
npm run test:browser:ui
npm run test:browser:credentials
npm run test:browser:queries
npm run test:browser:production
npm run test:browser:host
npm run test:browser:mermaid
```

Run independent installation and browser checks from a real `npm pack` artifact:

```sh
npm run test:pack
```

The version check uses an authenticated, controlled old service with matching descriptor/health metadata to test package mismatch and the explicit-stop exception.

The checks create isolated temporary operating-system homes and use them for
`os.homedir()`, rather than adding a product-specific storage override. They
operate on copied examples and local demonstration services, never real GitHub
writes or release systems. The tests clean up their own services. Install the
matching browser once using `npx playwright install chromium` if it is unavailable;
`PANEON_TEST_BROWSER` may select an existing Chromium executable for the test
runner only. `PANEON_TEST_ARTIFACTS` optionally selects a directory for screenshots.
These are test-runner settings, not Paneon runtime options.

The UI, credential, query lifecycle, production-runtime, and host lifecycle runners use the installed Google Chrome
channel by default. Set `PANEON_TEST_BROWSER_CHANNEL` to another Playwright
channel when needed. The acceptance and package runners instead accept
`PANEON_TEST_BROWSER` as the Chromium executable path.
