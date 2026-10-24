---
name: architecture-responsibilities
description: Paneon provides human-agent interfaces without owning business backends or execution policies
type: tech
---

# Product responsibility boundary

Paneon owns interface rendering, local function calls, interaction events, and diagnostics for the framework itself. When a panel calls an external CLI, service, or library, its business success criteria, scheduling, retries, and data storage belong to the panel code.

**Why:** Framework capabilities and application policies have separate owners.
**How to apply:** Keep business-specific execution policies in panel code.
