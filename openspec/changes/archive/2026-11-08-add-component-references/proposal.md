## Why

Agents writing custom pages learn `@qoggy/paneon/ui` only from the component table and a few bullets in `references/authoring.md`. Most components have no import list or props there, so agents guess part names and props, and the authoring reference grows each time a component gains a note. The agent cannot rely on `src/ui/README.md`, because it is not shipped in the package.

## What Changes

- Add `skills/paneon-visualize/references/components/`, with one hand-written Markdown file per public component module and an `index.md` that lists every file with a one-line purpose.
- In the first version, each component file has exactly three sections: `Use when` (one sentence on one line), `Import` (the exported names from `@qoggy/paneon/ui`) and `Props` (the commonly used props as a TypeScript interface excerpt).
- Move the component table and per-component bullets out of the `Components` section of `references/authoring.md` into the new files. Keep the general rules (prefer existing components, upstream shadcn styling) in `authoring.md` together with a link to `components/index.md`. Annotation content stays in `authoring.md`; component files link to it.
- Update the `SKILL.md` line that lists what `authoring.md` covers, so agents can find the component references.
- Add an automated test that checks the documented `Import` names against the runtime exports of `@qoggy/paneon/ui`, and checks that each component file has the required sections and is linked from `index.md`.
- Out of scope for this version: generated docs, `Example` and `Pitfalls` sections, type-checking examples, and a CLI command for reading docs.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `paneon-agent-skill`: Add a requirement that the skill ships per-component references for the public UI package, kept consistent with its exports.

## Impact

`skills/paneon-visualize/SKILL.md`, `skills/paneon-visualize/references/authoring.md`, new files under `skills/paneon-visualize/references/components/`, and one new test under `tests/`. No change to runtime code, the public API, the CLI, dependencies or the package `files` list, which already includes `skills/`.
