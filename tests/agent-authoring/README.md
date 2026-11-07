# Agent authoring experiment

Run one reviewed task through the installed Codex CLI. Record execution time, the exact prompt, CLI events, the final answer and native session rollout. Task quality is reviewed separately; a successful Codex exit is not a passing grade.

## Review before running

Review [the four tasks and experiment conditions](REVIEW.md) with the user. Start a real Codex task only after the user explicitly approves its prompt and condition. There is no automatic launch or approval flag. Task files contain short, ordinary requests, without page requirements, output contracts or evaluation criteria.

## Conditions

<!-- prettier-ignore -->
| Condition | Provide paneon-visualize | Explicit invocation prefix | Option |
| --- | --- | --- | --- |
| Baseline | No | No | None |
| Available | Yes | No | `--skill` |
| Forced | Yes | Yes | `--invoke-skill` |

The explicit prefix is exactly:

```text
[paneon-visualize](~/.agents/skills/paneon-visualize/SKILL.md)
```

The task body stays identical. `--invoke-skill` provides the skill and prepends that line followed by a blank line. A task already beginning with that prefix selects the forced condition without duplicating it.

By default, each run uses a fresh workspace under `/tmp/paneon-exp/runs/`, outside the project so project instructions and skills are not automatically inherited. No generated `AGENTS.md` tells the agent to use Paneon. An invocation-local `skills.config` override disables every skill named `paneon-visualize`; available and forced conditions then enable only `~/.agents/skills/paneon-visualize/SKILL.md`. This uses Codex's [documented name and path selectors](https://developers.openai.com/codex/skills/). The override replaces the per-skill configuration array for this process only; it does not edit user configuration or skill files. Other model, tool and global instruction settings are inherited equally.

The provided skill is snapshotted outside the workspace's discovery directories. Its source is the user-specified installed skill, not silently replaced with the repository's copy. Native discovery/invocation still needs verification in the first approved real run. Providing the skill, reading it and delivering a Paneon interface are distinct observations; the runner does not force a quality gate.

## Run

Build the repository first if its build is stale. All conditions put a launcher for this repository's `dist/cli/index.js` first on `PATH`; the logging task can use the same CLI without the authoring skill.

```sh
node tests/agent-authoring/run.ts --help

# Only after task and condition approval:
node tests/agent-authoring/run.ts --task tests/agent-authoring/tasks/completable-future.md
node tests/agent-authoring/run.ts --task tests/agent-authoring/tasks/completable-future.md --invoke-skill

# Available skill, without naming it in the prompt:
node tests/agent-authoring/run.ts --task tests/agent-authoring/tasks/test-duration.md --skill

# Optional explicit model/configuration:
node tests/agent-authoring/run.ts --invoke-skill --model MODEL --config model_reasoning_effort=medium
```

Compare the same model, reasoning setting, task body, data and CLI/skill versions. Model selection inherits existing configuration unless overridden. The prompt, skill snapshot and resolved model context are retained. The runner does not launch a matrix or repeat tasks automatically.

The CLI runs with `workspace-write`, an additional writable `~/.paneon` directory for the runtime, and network access to reach it. These settings are identical across conditions and recorded in `run.json`. Sandbox/approvals are not bypassed. The panel and service can remain after the agent exits or is cancelled. No credentials or environment dump are copied into artifacts.

## Cancel

Press Ctrl+C or send SIGTERM to the runner. The adapter sends SIGINT to the Codex process group so it can flush its session. If it has not exited after five seconds, SIGKILL stops that group. Available events and rollout are retained. A forced kill can leave an incomplete final record; the reading view reports parse errors and the raw file stays intact.

`startCodex({prompt, cwd, output})` from `codex.ts` returns `{pid, output, result, cancel}`. `cancel()` waits for cancellation and export. This version targets the local macOS/POSIX lifecycle.

## Artifacts

- `workspace/`: agent-generated files.
- `skill-snapshot/`: provided skill, only for available/forced conditions.
- `prompt.md`: exact stdin, including any invocation prefix.
- `environment.json`: condition, skill exposure/source, task path and repository/CLI versions.
- `run.json`: executable, arguments, cwd, Codex home, PID and start time.
- `events.jsonl`: byte-for-byte CLI stdout, available to tail while running.
- `stderr.log`: byte-for-byte CLI stderr.
- `final.md`: final message, when available.
- `result.json`: status, elapsed time, exit/signal, session ID, usage and export/parse errors.
- `rollout.jsonl`: native session copied by exact ID.
- `transcript.md`: response items, context, usage and compaction with source-line pointers.

Time starts immediately before spawning Codex and stops at process close. Preparation/export are excluded. Exit zero plus `turn.completed` means execution completed; it does not grade the answer. Failures and cancellations retain artifacts. Missing rollouts are reported instead of substituting summaries for a complete trace.

The rollout contains messages, tool arguments and results as recorded by Codex, including freeform tools. The reading view does not truncate them. Codex itself can limit output; copying cannot recover unrecorded data. A rollout is session history, not every model HTTP request. `turn_context` is a conversation turn, not each model invocation; this version does not invent per-request inputs or response boundaries.

## Verify without a model

```sh
node --test tests/agent-authoring.test.ts
```

Checks use a fake local CLI and task/skill fixtures. They cover execution, stdin, cancellation, trace preservation and the three prompt/exposure conditions. They never invoke Codex or contact a model. The integration was prepared against local Codex 0.163.0; native behavior still needs an approved real run.

References: [non-interactive mode](https://developers.openai.com/codex/noninteractive), [SDK](https://developers.openai.com/codex/sdk), [native rollout persistence](https://github.com/openai/codex/blob/main/codex-rs/rollout/src/policy.rs).
