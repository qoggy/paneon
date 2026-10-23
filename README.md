# Paneon

Build interactive human–agent interfaces with TypeScript and React.

An agent writes a local TSX panel, runs one command, and gives you a browser link.
Buttons can call local functions directly or save an event for your agent to read.
Panels keep working while the agent is stopped; the agent can read your choices
when you resume it. Source files remain ordinary, reusable code.

Paneon provides `paneon/sdk`, styled `paneon/ui` components, a local browser host,
and durable interaction events. It uses the upstream shadcn default Neutral theme.
Your panel owns its business calls, state, logs, storage, and retry policy.

This repository contains the first development iteration. No public npm release
is available yet. Node.js **24** is required.

## Try it locally

```sh
npm ci
npm run build
node dist/cli/index.js panel run examples/decision-panel.tsx --cwd "$PWD" --open --json
```

The CLI returns an `instanceId` and `url`, plus the effective state and version.
It exits after creating the panel; the local server continues running. Automatic
source reload is enabled by default. Use `--no-watch` when you want manual reload.
A panel source directory does not need its own `package.json` for the built-in SDK
and components.

```sh
node dist/cli/index.js panel inspect <instance-id> --json
node dist/cli/index.js panel events <instance-id> --consumer assistant --json
# Process the returned events before acknowledging them:
node dist/cli/index.js panel ack <instance-id> --consumer assistant --through <event-id> --json
node dist/cli/index.js panel close <instance-id> --json
node dist/cli/index.js server stop --json
```

`inspect` returns the existing panel's reusable link. Closing a browser tab does
not close a panel. `panel close` closes one instance; `server stop` stops the local
service. Neither command deletes the source or saved interaction events.

## Service logs

The server writes framework logs to `~/.paneon/logs/` at `info` level by default.
These logs are separate from panel business logs and interaction events.

```sh
paneon server status --json
paneon server logs --tail 100
paneon server logs --level error --json
paneon server logs --follow
```

Reading logs never starts or contacts the server, and works after it stops.
`--follow` also follows file rotation and later server starts; Ctrl+C ends only
that reader. Add `--runtime <runtime-id>` or `--instance <instance-id>` to filter
existing context. Finite JSON contains `records`, `files`, `truncated`, and
`warnings`; follow JSON emits one envelope per record or warning.

To change collection level, set `PANEON_LOG_LEVEL` when starting a new server:
`debug`, `info`, `warn`, `error`, `fatal`, or `off`. It does not change an already
running server. CLI `--debug` still applies only to the current command's stderr;
`server logs --level` only filters retained records.

Each server start creates its own JSONL group: one current file and two archives,
up to 5 MiB each. Startup and rotation retain at most four groups including the
current one, and remove historical groups last modified more than seven days ago.
This is a retention limit, not a guarantee of seven complete days. The asynchronous
queue is capped at 1 MiB, records at 64 KiB, and normal shutdown flushes for up to
500 ms. Congestion, disk failures, or abrupt exits can lose records; status exposes
writer failures and drop counts. Share logs carefully: error details are preserved,
and the logger does not automatically redact arbitrary content.

## Examples

- [Decision review](examples/decision-panel.tsx): option cards, comparison table,
  an interactive SVG explanation, and feedback for the agent.
- [Parameter form](examples/form-panel.tsx): fields, validation, and submission.
- [Table with actions](examples/table-panel.tsx): filtering and author-owned pagination.
- [Component gallery](examples/components-panel.tsx): the complete component set.
- [CLI integration](examples/release-panel.tsx): an isolated simulated release CLI.
- [HTTP integration](examples/http-panel.tsx): a local HTTP counter service.
- [GitHub PR browser](examples/gh-panel.tsx): real `gh` reads and agent review requests.

Agent usage instructions, API references, and reusable panels live in the
[Paneon skill](skills/paneon/SKILL.md). See the [example directory](examples/README.md)
for the purpose and setup of the repository examples.

## Install a local package

```sh
npm pack
npm install -g /absolute/path/to/paneon-0.0.0.tgz
paneon --help
paneon init
```

Run `paneon init` to install the bundled, matching skill for your agents. The
terminal flow selects agents, Project (default) or Global scope, and Symlink
(recommended) or Copy when different agent directories are involved. Universal
agents share `.agents/skills`; a shared directory is copied once without asking
for an installation method. Review target paths and `overwrites:` before confirming.
Existing Paneon skill directories are replaced completely, including local edits;
correct links are retained. Other skills are left untouched.

From a local build, use `node dist/cli/index.js init`. For scripts:

```sh
paneon init --agent codex claude-code --project --yes --json
paneon init --agent claude-code --global --copy --yes --json
```

`--agent` uses the IDs listed in `paneon init --help`. Without explicit agents,
`--yes` chooses Universal and detected targets. JSON and non-terminal invocations
require `--yes` and never show prompts. Installation records stay in
`~/.paneon/skill-installations.json`; no project metadata directory is created.
After upgrading the CLI, rerun `paneon init` to synchronize its bundled skill.
A unified `paneon update` command is not implemented yet.

After upgrading Paneon, explicitly stop an older server before running panels
with the new CLI. Panels declare a compatible package range with
`requires: { paneon: '0.0.0' }`. An unsupported range produces an error; Paneon does
not silently install another SDK or modify your source.

## Interface preferences

Choose **Settings** on the home page, or configure the same user preferences from the CLI:

```sh
paneon config get
paneon config set ui.theme dark
paneon config set ui.language zh-CN
```

The defaults are `light` and `en`. Supported values are `light` / `dark` and
`en` / `zh-CN`. Paneon saves preferences in `~/.paneon/config.json` and updates
open home pages, panel hosts, and newly compiled panel interfaces immediately.
Changing preferences keeps answers, annotation drafts, current views, and event receipts.

Paneon's own controls and standard-page instructions follow the selected language.
Author-supplied titles, questions, Markdown, code, Git/PR content, and user input
stay in their original language. Public UI components inherit the theme; custom
pages can read `useUI()` from `paneon/ui`. See the bundled skill's
[preferences guide](skills/paneon/references/preferences.md).

Existing instances compiled with an older release and previously copied custom
TSX retain their own hardcoded text until their source is updated and recompiled.
Paneon does not reload them automatically. Direct config-file edits are read on
runtime startup; live updates use Settings or `config set`.

## Development

```sh
npm run typecheck
npm run build
npm test
npm run lint
npm run format:check
```

Real-browser and independent-package checks live in `tests/browser/` and
`tests/acceptance*.mjs`. These use isolated temporary operating-system homes.
Paneon's own runtime directory is fixed to `~/.paneon`.

## License

[MIT](./LICENSE)
