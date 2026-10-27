---
name: documentation-skill-public-surface
description: The skill documents only paneon/sdk and paneon/ui for custom pages; built-in panel internals such as assets/shared stay undocumented but are not forbidden
type: documentation
---

# Skill public surface

Capabilities meant for custom pages live in `@qoggy/paneon/sdk` and `@qoggy/paneon/ui`. The skill documents only those packages for authoring.

`skills/paneon/assets/shared/` and other modules inside built-in panels and examples are code shared by the built-in pages. Do not introduce, link to or recommend them in SKILL.md or references, and do not tell agents to copy the skill directory to reuse them. Equally, do not add warnings that forbid them: if a human discovers them and explicitly wants to use them, that is acceptable.

**Why:** Only the SDK and UI packages are maintained as public interfaces; built-in panel code may change freely. Mentioning it, even to prohibit it, draws agents toward it.
**How to apply:** When a reusable capability is needed for custom pages, move it into the SDK or UI package rather than documenting a skill asset. Built-in panels and examples may be run and read for reference, not imported.
