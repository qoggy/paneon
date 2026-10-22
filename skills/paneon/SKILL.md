---
name: paneon
description: Collects human decisions, structured input, and precise feedback through ready-to-run local Paneon panels. Use for option comparisons, forms, table exploration, Markdown review, multi-repository Git review, read-only GitHub PR review, or interactive explanations.
compatibility: Requires the matching Paneon CLI (currently 0.0.0), Node.js 24, local command execution, and a browser accessible to the human.
---

# Paneon

1. Select a page from the directory below and read its contract. Prepare matching JSON; the explanatory examples keep their fixed topic and data in source.
2. Resolve this skill's absolute directory, then run its ordinary TSX entry with `paneon panel run <entry> --cwd <working-directory> --params '<json>' --json`. Read the returned instance ID and deliver its browser URL to the human.
3. Read the saved result with `paneon panel events <instance-id> --consumer <stable-consumer> --wait-ms 60000 --json`. If no result is returned, keep the instance ID and consumer for a later read. A page click cannot wake an ended agent session.
4. Interpret the complete result against that instance's input. A result with `replacesEventId` corrects an earlier result; keep the history and decide explicitly how already-performed actions are affected. After processing, acknowledge with `paneon panel ack <instance-id> --consumer <stable-consumer> --through <event-id> --json`.
5. Start each new question round with another `panel run` and deliver the new link. Existing instances retain their questions. Use ordinary `panel inspect`, `reload`, `close`, and `list` commands for lifecycle management.

Run a listed TSX entry directly with data matching its contract; standard pages do not require generating TSX. Each page directory contains its executable schema. The standard pages use the page-level [submission helper](assets/shared/submission.ts) to retain successful receipts and save complete corrections. To customize, copy the complete skill directory so relative imports remain intact, then edit the copied TSX.

For larger inputs, write the same JSON to a file and replace `--params` with `--params-file /absolute/input.json`. Supply exactly one input source. Relative input-file paths use the invoking directory, while `--cwd` controls panel functions. The instance keeps its creation-time input after the file changes or disappears.

## Page directory

| Need                                                                                      | Contract                               | TSX entry                                                                      |
| ----------------------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------ |
| Sequential questions with options or custom answers                                       | [Choose](references/choose.md)         | [choose/panel.tsx](assets/panels/choose/panel.tsx)                             |
| Related parameters on one form                                                            | [Form](references/form.md)             | [form/panel.tsx](assets/panels/form/panel.tsx)                                 |
| Search, filter, sort, select and annotate readonly data                                   | [Table](references/table.md)           | [table/panel.tsx](assets/panels/table/panel.tsx)                               |
| Review a complete Markdown document with exact text feedback                              | [Review](references/review.md)         | [review/panel.tsx](assets/panels/review/panel.tsx)                             |
| Working changes, history and comparisons across explicit repositories                     | [Git review](references/git-review.md) | [git-review/panel.tsx](assets/panels/git-review/panel.tsx)                     |
| Browse GitHub PR descriptions, fixed-version diffs and checks; send opinions to the agent | [GitHub PR](references/github-pr.md)   | [github-pr/panel.tsx](assets/examples/github-pr/panel.tsx)                     |
| Explore concurrency and queueing with fixed tasks                                         | [Examples](references/examples.md)     | [concurrency/panel.tsx](assets/examples/concurrency/panel.tsx)                 |
| Explore Sentinel LeapArray's ring buckets                                                 | [Examples](references/examples.md)     | [sentinel-leap-array/panel.tsx](assets/examples/sentinel-leap-array/panel.tsx) |

Table, review and Git pages emit feedback only on explicit submission; navigation and draft edits do not emit results. Preserve source references when interpreting annotations. These pages support complete corrections linked by `replacesEventId`. The two explanatory examples demonstrate an author-controlled workflow and run with `--params '{}'`.

## Installation and versions

Run `paneon init` to install the bundled, matching skill. The interactive flow selects agents, Project (default) or Global scope, and Symlink (recommended) or Copy when targets use different directories. Universal agents share one `.agents/skills` copy. Existing skill directories are replaced, including local changes; review overwrite paths before confirming. Do not ask the user to separately locate or copy this skill.

For noninteractive installation, use `paneon init --agent codex claude-code --project --yes --json` (or `--global`, optionally `--copy`). Use installed help for supported agent IDs. JSON or non-terminal calls require `--yes`. Records stay in `~/.paneon/skill-installations.json`. After a CLI upgrade, rerun init to synchronize its bundled skill. A unified update command is not implemented.
The complete `skills/paneon` resources ship with the CLI release and have no independent version sequence. Supplied panels currently declare `requires.paneon: '0.0.0'`, the package version verified for them. Preserve compatibility declarations and relative imports when customizing a copy; copying source for customization is separate from the installation flow.

## Custom pages and runtime reference

- [Authoring](references/authoring.md): complete TSX, serverAction, CLI/HTTP calls, query states, components, Markdown/Mermaid and temporary credential input.
- [Feedback](references/feedback.md): copyable public Provider/hook/object/text example, exact source adapters, explicit submission and correction boundaries.
- [CLI](references/cli.md): command inputs/results, parameter snapshots, compatibility, lifecycle, events/ack and diagnostics.

The CLI executes ordinary TSX and stores declared events; the skill supplies reusable pages and workflow instructions. Business calls, scheduling, monitoring, logs and storage remain page code responsibilities.
