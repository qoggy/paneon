---
name: tech-source-updates
description: Reuse established Vite and React source-update behavior instead of building a custom hot-update lifecycle
type: tech
---

# Source updates

Use Vite and React's existing watching, module invalidation, hot updates, and reload behavior. Do not build a separate hot-update engine or retain old workers/artifacts until in-flight calls complete. Do not add call handover, result migration, or stronger completion/state-preservation guarantees than the integrated tools provide.

Browser HMR does not automatically manage Paneon's custom serverAction RPC or Node execution environment. Connect server actions to Vite's existing Node module loading/invalidation facilities and verify the actual behavior. Keep necessary SDK integration rather than inventing a parallel update mechanism.

Per-panel watch/no-watch selection, manual reload, version/identity checks, durable events and consumer positions, credential binding, and secret-output protection remain required. Source updates must not automatically retry mutations.

**Why:** The user explicitly chose normal toolchain behavior over a Paneon-specific lifecycle for old functions during updates.
**How to apply:** Remove earlier requirements that guarantee in-flight functions continue on their original revision by retaining an old worker. Validate and document the selected toolchain's behavior without claiming TypeScript itself provides HMR or that Vite automatically understands serverAction.
