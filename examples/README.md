# Reusable panels

Run these commands from the repository after `npm ci && npm run build`. Replace
`node dist/cli/index.js` with `paneon` when using an installed package. Pass the
absolute directory containing these examples as `--cwd` when running from another
directory. SDK and UI imports resolve from the installed Paneon package; basic
panel definitions do not need their own npm project.

```sh
node dist/cli/index.js panel run examples/decision-panel.tsx --cwd "$PWD" --params '{}' --open --json
node dist/cli/index.js panel run examples/form-panel.tsx --cwd "$PWD" --params '{}' --open --json
node dist/cli/index.js panel run examples/table-panel.tsx --cwd "$PWD" --params '{}' --open --json
node dist/cli/index.js panel run examples/components-panel.tsx --cwd "$PWD" --params '{}' --open --json
```

These examples declare exactly the current development version, `0.0.0`. Check
and update the range deliberately when reusing them with another version.

## Simulated CLI integration

```sh
node dist/cli/index.js panel run examples/release-panel.tsx --cwd "$PWD" --params '{}' --open --json
```

`business.ts` calls `demo-release-cli.mjs` using `execFile` and argument arrays.
Add a branch, advance a simulated step, switch environments, or request AI
analysis. Nothing is deployed. The demonstration CLI stores its own state and
history in `.paneon-demo-release.json` in the chosen working directory. This is an
example-owned business file, outside Paneon's runtime storage contract.

You can also call the demonstration CLI directly:

```sh
node examples/demo-release-cli.mjs status staging
node examples/demo-release-cli.mjs integrate staging feature/example
node examples/demo-release-cli.mjs advance staging
node examples/demo-release-cli.mjs reset
```

The state file is a small single-user demonstration, not a concurrent release
system. Business serialization, persistence, process management, and operational
logs remain the author's responsibility.

## Local HTTP integration

In one terminal:

```sh
node examples/demo-http-server.mjs 43180
```

In another terminal:

```sh
node dist/cli/index.js panel run examples/http-panel.tsx --cwd "$PWD" --params '{"baseUrl":"http://127.0.0.1:43180"}' --open --json
```

Increment the counter directly or submit its value to the agent. Stop the demo
HTTP service to see the error state, then start it and explicitly refresh.
The HTTP service's counter is in memory and resets when that service restarts.
It is independent of the Paneon service.

## Real GitHub CLI integration

Install [GitHub CLI](https://cli.github.com/), run `gh auth login`, and ensure your
account can read the selected repository. An existing login is reused by the
example's server-side `gh` process; no credential is passed through panel params.

```sh
gh auth status
node dist/cli/index.js panel run examples/gh-panel.tsx --cwd "$PWD" --params '{"repository":"OWNER/REPO"}' --open --json
```

The panel queries repository information and up to 30 open PRs, opens PR details,
and saves explicit requests for agent review. Refresh and details are direct
server actions; **Ask AI to review** only saves an event. This example does not
create, edit, merge, or comment on PRs and does not start workflows.

The following capabilities were checked against the installed CLI's help:

```sh
gh repo view --help
gh pr list --help
gh pr view --help
```

The implementation uses `gh repo view OWNER/REPO --json nameWithOwner,description,url`,
`gh pr list --repo OWNER/REPO --limit 30 --json number,title,state,headRefName,url`,
and `gh pr view NUMBER --repo OWNER/REPO --json number,title,state,headRefName,url,body,baseRefName,isDraft`.
Repository and PR calls live in `github.ts`; Paneon has no GitHub adapter.

## Read and acknowledge requests

```sh
paneon panel events <instance-id> --consumer assistant --wait-ms 30000 --limit 100 --json
# Handle every event up to the chosen ID, then acknowledge:
paneon panel ack <instance-id> --consumer assistant --through <event-id> --json
```

Reading does not acknowledge. Unacknowledged events are returned again, including
after restarting the agent or Paneon. Reuse the same consumer name to resume its
position. Paneon cannot automatically wake an agent that has stopped.

## Reuse and edit

Copy a TSX file and its relative business modules, change the definition's `id`
when useful, and run it with new params. Every `panel run` creates a new instance,
even for the same definition. Save source to update watched instances; use
`--no-watch` and `panel reload <instance-id>` for deliberate updates. Reload may
reset local input and call results. It does not replay a mutation.

For a link to an existing instance, use `panel inspect`; do not run the source
again merely to open another tab. The source remains independent of runtime
records and can be placed in any directory or version control system.
