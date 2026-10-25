# Examples

Each example is a complete custom page. Run it as-is, or read its source to borrow a technique; write new pages on `paneon/sdk` and `paneon/ui` rather than importing from the example. `<skill>` is the absolute path of this skill directory.

## Dining philosophers

[Source](../assets/examples/dining-philosophers/panel.tsx). Compares three fork-acquisition strategies for the dining philosophers problem, one instruction per step.

```sh
paneon panel run <skill>/assets/examples/dining-philosophers/panel.tsx --cwd /work/project --json
```

Borrow: a deterministic page-local state model in plain TypeScript, play/pause/step/timeline controls, an SVG diagram derived from the same state. No input, no events.

## Sentinel LeapArray

[Source](../assets/examples/sentinel-leap-array/panel.tsx). Explains Sentinel's sliding-window `LeapArray` at a pinned commit, replaying requests through its buckets.

```sh
paneon panel run <skill>/assets/examples/sentinel-leap-array/panel.tsx --cwd /work/project --json
```

Borrow: links to real source at a fixed commit, editable scenario parameters validated before applying, a recorded trace replayed with a time slider. No input, no events.

## GitHub PR

[Source](../assets/examples/github-pr/panel.tsx). A read-only workspace for a PR's description, fixed-version diff and checks. Requires an installed and authenticated `gh`.

```sh
paneon panel run <skill>/assets/examples/github-pr/panel.tsx \
  --cwd /work/project --params '{"repository":"cli/cli","initialPullRequest":14768}' --json
```

Input is `{repository: "owner/repo", initialPullRequest?: number}`; without a number it opens the open-PR list. It never publishes to GitHub. It emits `review-requested` (the viewed PR and its fixed base/head commits) and `pr-feedback-submitted` (annotations with their sources); the schemas are in its source.

Borrow: server actions that call a local CLI, list/detail browsing with Tabs, annotations on `Markdown` and `DiffView`, several declared event types.

These examples ship with Chinese and English copy because they are distributed with Paneon; a one-off page usually needs only one language (see [authoring](authoring.md#theme-and-language)).
