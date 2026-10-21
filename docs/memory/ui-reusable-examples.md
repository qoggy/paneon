---
name: ui-reusable-examples
description: Provide copyable TSX compositions and at least one real CLI or OpenAPI integration example
type: tech
---

# Reusable panel examples

Provide local TSX examples that agents can copy and modify, covering option comparison, parameter forms, and tables with actions. Show loading, empty, error, disabled, and success states through component composition and author-owned React state.

Include at least one real CLI/OpenAPI integration example. The user selected gh CLI for the initial iteration. Build a repository/PR panel showing lists, details, and actions. Verify the actual commands used when implementing the example. Document prerequisites and usage, and demonstrate both direct server actions and explicit agent events.

**Why:** Examples make the component library easier to use and demonstrate that panels can connect to existing tools with ordinary code.
**How to apply:** Keep tool calls, data conversion, and business behavior in example modules. Do not add a CLI executor, business monitoring, or log management to the core. Keep isolated demonstration backends for automated checks without external accounts.
