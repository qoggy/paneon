---
name: documentation-panel-contracts
description: Built-in panel references describe when to use a panel, what it achieves and its input in full; results get only the semantics an agent would misread, never an event example or field list
type: documentation
---

# Built-in panel references

Each built-in panel reference in `skills/paneon-visualize/references/` is written for an agent deciding on and operating the panel. Cover:

- **When to use it**: the need it fits, in one or two sentences.
- **What it achieves**: what the human can do on the page and what the agent gets back.
- **Input**: the run entry, an input example and every rule, including constraints that reject input. Describe input completely: the agent builds it before it sees any feedback, so a gap means failed runs and retries.
- **Results**: the event type in one sentence, plus only the semantics an agent cannot read from the payload and would act on wrongly, such as offsets that may be stale after the file changes, which list an index refers to, or what an omitted field means. No event JSON example and no field-by-field description.

The same rule covers result descriptions in `SKILL.md` "Read results". It does not cover what a custom page's code receives, such as `onSubmit` values in `references/authoring.md`: the agent writes that code before any data exists, so it is input.

Do not write interface specifications: layout, sizes, colors, toolbars, keyboard steps, button labels, interaction details or internal implementation. Do not repeat what SKILL.md or `--help` already covers, such as `events` / `ack` commands or `--params-file` behavior.

**Why:** Agents read result payloads directly; field names carry their meaning. In a check on 2026-11-03, a mid-level agent given only the input documentation interpreted file, diff, Git, table, choose, form and custom-page results correctly, including `replacesEventId` replacement, offsets into a file changed since, table `rowIndex` after sorting and `sourceRef` targets. It was unsure only what an omitted form field meant. Interface details likewise cost context without changing what the agent does; they belong in openspec designs and tests.
**How to apply:** When adding or updating a built-in panel, follow the existing references (for example `table.md`). For each result sentence, ask whether an agent reading the payload would get it wrong without the sentence; if not, leave it out.
