# CLI operation and compatibility

Use `paneon --help`, `paneon panel --help`, and command-specific help for the installed version. CLI-generated text is English; page content and event payloads retain their language.

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
| `init` | Optional `--agent <agents...>`, `--project` / `--global` (exclusive), `--copy`, `--yes`; `--json` requires `--yes` | `scope`, optional `projectPath`, `method`, `paneonVersion`, `recordPath`, `targets` with paths/kinds/status; cancellation returns `{ "cancelled": true }` |
| `panel run <entry.tsx>` | Required `--cwd <directory>` and exactly one of `--params '<json>'` / `--params-file <file>`; optional `--watch` / `--no-watch`, `--open` | `instanceId`, `definitionId`, `status`, `revision`, `watch`, `paneonVersion`, `url` |
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
lives. Both input forms must satisfy the panel's schema; pass `'{}'` for an empty object.
`--params-file` reads UTF-8 JSON once at creation, using the invoking directory for relative file paths.
Changing or deleting that file does not alter the instance; reload and service recovery reuse its saved input.
Start a new instance for new questions or new fixed input.
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

## Install the bundled skill

```sh
paneon init
paneon init --agent codex claude-code --project --yes --json
paneon init --agent claude-code --global --copy --yes --json
```

`init` installs the current package's complete skill without starting the local
service, downloading skills, or changing npm dependencies. In a repository build,
use `node dist/cli/index.js init`; Paneon has no public npm release yet.

The terminal flow selects agents, scope (Project by default), and, for different
directories, Symlink (Recommended) or Copy to all agents. Universal agents are
always selected in the interactive menu and share `.agents/skills`; one shared
directory is copied directly without a method prompt. An explicit `--agent` list
installs only the named agents. Without it, `--yes` uses Universal plus detected
targets. Detection only assists selection and does not prove an agent loaded the skill.
Use `init --help` for supported IDs.

Review Installation Summary, including `overwrites:`, then confirm. Ordinary
`paneon` target directories are cleaned and copied again, overwriting local edits
and removing obsolete resources. Correct symlinks are retained. No backup or
merge is attempted. Other skills and parent directories are preserved. Cancel or
answer No to exit successfully without writing files.

`--project` targets the current invoking directory; `--global` targets user-level
agent directories. The flags are mutually exclusive. JSON and non-TTY invocations
never prompt: supply `--yes`, otherwise `NON_INTERACTIVE_INPUT_REQUIRED` is returned.
Unknown agents fail with `INVALID_ARGUMENT` before writing. Successful targets
report `installed` or `linked`; failures never report a successful installation.
Metadata is kept only in `~/.paneon/skill-installations.json`, not in projects.
After upgrading the CLI, rerun init to synchronize the bundled skill. The future
unified `paneon update` command is not implemented.

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

Events allow at most 128 characters in the type and 65536 UTF-16 characters in the serialized payload. Complete requests allow 262144 UTF-8 bytes; oversized requests fail with `BODY_TOO_LARGE` (HTTP 413). Keep feedback focused and do not silently truncate or split a submitted result.
