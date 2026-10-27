---
name: ui-builtin-panel-components
description: Built-in panels compose paneon/ui components; ask the user before developing or adopting a new component
type: ui
---

# Components in built-in panels

Build built-in panels from `@qoggy/paneon/ui` components wherever possible, for example `Empty` for empty states, `Spinner` for loading and `toast` for transient results, rather than hand-built equivalents in panel code.

When the existing components cannot express a need, do not build an ad hoc replacement inside the panel. Describe the gap and ask the user to decide whether to develop a component or adopt one, such as an upstream shadcn component.

**Why:** Shared components keep built-in panels consistent with each other and with custom pages, and keep reusable UI in the public library rather than scattered across panels.
**How to apply:** Check the `@qoggy/paneon/ui` exports before writing UI for a built-in panel; raise missing components as a decision for the user before implementing them.
