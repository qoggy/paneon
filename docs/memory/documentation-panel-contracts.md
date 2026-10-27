---
name: documentation-panel-contracts
description: Built-in panel references in the skill describe when to use a panel, what it achieves and how to use it, never its interface specification
type: documentation
---

# Built-in panel references

Each built-in panel reference in `skills/paneon/references/` is written for an agent deciding on and operating the panel. Cover:

- **When to use it**: the need it fits, in one or two sentences.
- **What it achieves**: what the human can do on the page and what the agent gets back.
- **How to use it**: the run entry, input example and rules (including constraints that reject input), the submitted event example, and how to interpret results.

Do not write interface specifications: layout, sizes, colors, toolbars, keyboard steps, button labels, interaction details or internal implementation. Do not repeat what SKILL.md or `--help` already covers, such as `events` / `ack` commands or `--params-file` behavior.

**Why:** Agents run panels and read events; they do not operate the UI. Interface details cost context without changing what the agent does, and belong in openspec designs and tests.
**How to apply:** When adding or updating a built-in panel, follow the existing references (for example `table.md`) and keep only facts that change how the agent chooses the panel, prepares input or handles results.
