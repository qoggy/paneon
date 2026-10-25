---
name: paneon
description: Turns agent output that would be tiring to read as long text into local interactive Paneon pages, and brings the human's choices, inputs and precise feedback back to the agent. Use proactively when explaining code, mechanisms or plans that read better with diagrams, tables or interactive views; showing changed files, commits or PR diffs; presenting data or metrics; illustrating a data model or design; asking several related questions or requesting missing parameters; or collecting line-level feedback on a document. Ready-made pages cover choices, forms, tables, Markdown review and Git review; other needs can be built as custom TSX pages. Not for prototyping the product under development.
compatibility: Requires the Paneon CLI and Node.js 24.
---

# Paneon

`paneon panel run` serves a local TSX page and returns its URL. A page can render Markdown, Mermaid, code, diffs, tables and interactive views, call local functions, and save explicit events that the agent reads afterwards.

## Decide on a page

Judge by the shape of the content, not its length. Prefer a page for several files or diffs, tabular data, flows and structures that need diagrams, mechanisms that unfold step by step, or several related questions. Keep short answers in chat. A page is a convenience, never an obligation: chat or the agent's own question tool remains valid.

Then pick the source:

1. A [built-in page](#built-in-pages) fits: run it with JSON input, without writing TSX.
2. Otherwise write a [custom page](#custom-pages), for example an explanation of code, a mechanism or a plan, a data model diagram, a metrics view, or a control surface over a local CLI or HTTP service.

## Built-in pages

`<skill>` stands for the absolute path of this skill directory.

| Need                                                         | Contract                               | Entry                                        |
| ------------------------------------------------------------ | -------------------------------------- | -------------------------------------------- |
| Sequential questions with options or custom answers          | [Choose](references/choose.md)         | `<skill>/assets/panels/choose/panel.tsx`     |
| Related parameters on one form                               | [Form](references/form.md)             | `<skill>/assets/panels/form/panel.tsx`       |
| Tabular data to search, filter and sort                      | [Table](references/table.md)           | `<skill>/assets/panels/table/panel.tsx`      |
| A complete Markdown document                                 | [Review](references/review.md)         | `<skill>/assets/panels/review/panel.tsx`     |
| Working changes, history and comparisons across repositories | [Git review](references/git-review.md) | `<skill>/assets/panels/git-review/panel.tsx` |

## Run and deliver

```sh
paneon panel run <entry.tsx> --cwd <working-directory> --json
```

- Pass input with `--params '<json>'`, or write large input to a file and use `--params-file <file>`.
- Give the human the returned `data.url`. Keep `data.instanceId` for later commands.

Source watching is on by default: editing a custom page's TSX updates the open page at the same URL, so refine an explanation in place. Input is fixed per instance, so new questions or new data need another `panel run` and a new link.

## Read results

Skip this for presentation-only pages.

```sh
paneon panel events <instance-id> --consumer <stable-name> --wait-ms 60000 --json
```

- Reading does not acknowledge. If nothing arrives, tell the human to say when they have submitted, then read again.
- A result carrying `replacesEventId` replaces that earlier result entirely; do not merge the two. If work was already done based on the earlier result, tell the human what the correction affects before adjusting it.
- After handling, acknowledge: `paneon panel ack <instance-id> --consumer <stable-name> --through <event-id> --json`.

`panel inspect` returns an existing instance's current URL. Run `paneon <command> --help` for other commands, options and output fields.

## Custom pages

Write an ordinary TSX file with `definePanel`, components from `@qoggy/paneon/ui`, optional `serverAction` functions and declared events. Set `requires.paneon` to a range that includes the installed CLI (`paneon --version`).

Give each page its own directory, so its relative modules stay together. Choose the location by how the page will be used; an explicit instruction from the human always wins:

- One-off, for the current conversation: under `/tmp`.
- Reused by the human across tasks: `~/.paneon/library/<panel-name>/`. Check there for an existing page before writing a new one.
- Reused within a specific project: inside that project.

- [Authoring](references/authoring.md): complete source, events, server actions, queries, components, theme and language.
- [Annotations](references/annotations.md): selection and annotations on custom content, for pages that collect precise opinions.
- [Examples](references/examples.md): complete pages to run as-is or borrow techniques from: two explanations (dining philosophers, Sentinel LeapArray) and a read-only GitHub PR workspace through the local `gh` CLI.

Built-in pages and examples are for running and reading, not importing. Build custom pages on `@qoggy/paneon/sdk`, `@qoggy/paneon/ui` and the page's own modules.
