---
name: paneon
description: Turns agent output that would be tiring to read as long text into local interactive Paneon pages, and brings the human's choices, inputs and precise feedback back to the agent. Use proactively when explaining code, mechanisms or plans that read better with diagrams, tables or interactive views; showing changed files, commits or PR diffs; presenting data or metrics; illustrating a data model or design; asking several related questions or requesting missing parameters; or collecting line-level feedback on a document. Ready-made pages cover choices, forms, tables, Markdown review, Git review and GitHub PR review; other needs can be built as custom TSX pages. Not for prototyping the product under development.
compatibility: Requires the Paneon CLI and Node.js 24.
---

# Paneon

`paneon panel run` serves a local TSX page and returns its URL. A page can render Markdown, Mermaid, code, diffs, tables and interactive views, call local functions, and save explicit events that the agent reads afterwards.

## Decide on a page

Judge by the shape of the content, not its length. Prefer a page for several files or diffs, tabular data, flows and structures that need diagrams, mechanisms that unfold step by step, or several related questions. Keep short answers in chat. A page is a convenience, never an obligation: chat or the agent's own question tool remains valid.

Do not use Paneon to prototype the product under development; its built-in components and layout would distort the prototype.

Then pick the source:

1. A [built-in page](#built-in-pages) fits: run it with JSON input, without writing TSX.
2. Otherwise write a [custom page](#custom-pages), for example an explanation of code, a mechanism or a plan, a data model diagram, a metrics view, or a control surface over a local CLI or HTTP service.

## Built-in pages

`<skill>` stands for the absolute path of this skill directory. Each contract lists the input schema and the submitted event.

| Need                                                                         | Contract                               | Entry                                         |
| ---------------------------------------------------------------------------- | -------------------------------------- | --------------------------------------------- |
| Sequential questions with options or custom answers                          | [Choose](references/choose.md)         | `<skill>/assets/panels/choose/panel.tsx`      |
| Related parameters on one form                                               | [Form](references/form.md)             | `<skill>/assets/panels/form/panel.tsx`        |
| Tabular data to search, filter and sort                                      | [Table](references/table.md)           | `<skill>/assets/panels/table/panel.tsx`       |
| A complete Markdown document                                                 | [Review](references/review.md)         | `<skill>/assets/panels/review/panel.tsx`      |
| Working changes, history and comparisons across repositories                 | [Git review](references/git-review.md) | `<skill>/assets/panels/git-review/panel.tsx`  |
| GitHub PR description, fixed-version diff and checks (read-only, needs `gh`) | [GitHub PR](references/github-pr.md)   | `<skill>/assets/examples/github-pr/panel.tsx` |

Pages that display content let the human select parts of it, comment, and submit the comments together; each comment points back to the exact text, row, line or object it was made on. The contract states what a page's comments can target.

## Run and deliver

```sh
paneon panel run <entry.tsx> --cwd <working-directory> --json
```

- `--cwd` is where the page's local functions run, such as the repository for Git reads.
- Pass `--params '<json>'` for pages that need input. For large input, write the JSON to a file and use `--params-file <file>` instead. Do not supply both. The file is read once; the instance keeps that snapshot.
- Omit both input options for pages without input; the panel receives `{}`.
- Give the human the returned `data.url`. Keep `data.instanceId` for later commands.

Source watching is on by default: editing a custom page's TSX updates the open page at the same URL, so refine an explanation in place. Input is fixed per instance, so new questions or new data need another `panel run` and a new link.

## Read results

Only pages that collect input produce events. A presentation-only page needs no reading.

```sh
paneon panel events <instance-id> --consumer <stable-name> --wait-ms 60000 --json
```

- Reading does not acknowledge. If nothing arrives, tell the human to say when they have submitted, then read again with the same instance ID and consumer name.
- Results reference the input by ID (`questionId`, `optionId`, `rowIndex`, …) without repeating the questions or data. Resolve them against the params of the same instance.
- A result carrying `replacesEventId` replaces that earlier result entirely; do not merge the two. If work was already done based on the earlier result, tell the human what the correction affects before adjusting it.
- After handling, acknowledge: `paneon panel ack <instance-id> --consumer <stable-name> --through <event-id> --json`.

`panel inspect` returns an existing instance's current URL; `panel list`, `reload` and `close` manage instances. Command details, error codes and limits are in [CLI](references/cli.md).

## Custom pages

Write an ordinary TSX file anywhere under `/tmp`, with `definePanel`, components from `paneon/ui`, optional `serverAction` functions and declared events. Set `requires.paneon` to a range that includes the installed CLI (`paneon --version`). Business calls, retries, logs and storage stay in page code.

- [Interface preferences](references/preferences.md): user-level theme/language, inherited public UI, and original-content boundaries.
- [Authoring](references/authoring.md): complete source, server actions, CLI/HTTP calls, queries, components, Markdown/Mermaid, temporary credentials.
- [Feedback](references/feedback.md): selection and comments on custom content, for pages that collect precise opinions.
- [Explanation examples](references/examples.md): two one-off explanatory pages (concurrency queueing, Sentinel LeapArray) with fixed topic and data in source; use them as patterns for new explanations.

To reuse shared modules from `assets/shared/` or adapt a built-in page, copy the complete skill directory so relative imports keep working, then edit the copy.
