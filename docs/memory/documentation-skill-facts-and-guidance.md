---
name: documentation-skill-facts-and-guidance
description: The paneon skill keeps objective facts and model guidance apart; guidance lives only in references/presenting.md
type: documentation
---

# Skill facts and guidance

The paneon skill holds two kinds of text, and they never share a file:

- **Facts**: what Paneon provides, how to call it, its constraints, and product intent such as when a page is preferable. These live in `SKILL.md`, `references/authoring.md` and the built-in panel references.
- **Guidance**: how to present content well to a human, such as leading with the answer, choosing diagrams or tables, one decision per question, revising a page after feedback, and writing style. It compensates for current model habits and lives only in `skills/paneon/references/presenting.md`, linked from one line in `SKILL.md`.

Classify a sentence by asking whether a perfectly capable model would still need it. If yes, it is a fact; if no, it is guidance. Guidance examples are embedded in `presenting.md` as text; do not add example panels for guidance.

**Why:** Guidance will be trimmed as models improve. Keeping it in one file lets it shrink or be removed without touching the facts.
**How to apply:** When adding guidance, put it in `presenting.md` with generic, inline Bad/Good examples. When editing facts, keep advice about presentation out of them. To retire guidance entirely, delete `presenting.md` and its link in `SKILL.md`.
