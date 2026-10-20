---
name: paneon-memory
description: Read and maintain Paneon's shared, durable project memory in docs/memory/, including coding conventions, product terminology, technical decisions, domain models, and recurring constraints. Use before work that depends on long-term project conventions, when a task produces a cross-task fact worth preserving, or when the user asks to remember, document, or update project knowledge.
---

# Paneon Memory

Store shared project memory in `docs/memory/`.

## Memory Files

- `docs/memory/MEMORY.md`: Memory index.
- `docs/memory/**`: Detail files organized by topic when useful.

Keep `MEMORY.md` as a concise index. Put each durable fact in its own detail file, then add one link to the index. Never put the full memory content directly in `MEMORY.md`.

## Memory Format

Use a two-step structure: one fact per detail file, then one index entry.

Create each detail file with `name`, `description`, and `type` frontmatter followed by the fact. For rules that need application guidance, end with `**Why:**` and `**How to apply:**` lines.

Choose a semantic `type`, such as `coding`, `glossary`, `tech`, or `domain`.

Example detail file:

```markdown
---
name: coding-example
description: A concise description of the durable rule
type: coding
---

State the durable project rule clearly.

**Why:** Explain why the rule exists.
**How to apply:** Explain where and when to apply it.
```

Add one concise index entry:

```markdown
- [Memory title](coding-example.md) — One-line description
```

## Reading Memory

1. Read `docs/memory/MEMORY.md` before work that depends on durable project conventions.
2. Follow only the links relevant to the current task.
3. Do not read the entire memory directory without a task-specific reason.

## When to Update Memory

Update project memory when:

- The user explicitly asks to remember or record a project convention.
- The work establishes a convention, term, technical decision, or domain model that remains useful across tasks.
- A recurring project constraint or pitfall has been verified and will affect future development.

Do not store:

- One-off debugging details or temporary task state.
- Personal preferences that are not project conventions.
- Guesses, unresolved proposals, or facts that have not been verified.
- Secrets, credentials, tokens, passwords, or other sensitive information.

## Updating Memory

1. Read `docs/memory/MEMORY.md` and relevant detail files to avoid duplication or contradiction.
2. Create or update one detail file per durable fact.
3. Add or update exactly one corresponding entry in `docs/memory/MEMORY.md`.
4. Keep names descriptive and stable; prefer updating an existing fact over creating a duplicate.
5. Report every changed memory file to the user.
