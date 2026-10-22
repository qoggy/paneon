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
node dist/cli/index.js panel run examples/decision-panel.tsx --cwd "$PWD" --params '{}' --open --json
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
