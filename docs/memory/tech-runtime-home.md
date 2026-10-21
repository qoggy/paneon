---
name: tech-runtime-home
description: PANEON_HOME is an internal constant fixed to the current user's ~/.paneon directory
type: tech
---

# Runtime home

Define PANEON_HOME as a shared internal constant resolving to the current user's home directory plus .paneon. CLI and runtime use the same definition.

Do not read process.env.PANEON_HOME or expose a CLI flag or configuration-file setting to override this directory in the initial iteration. Panel source location and --cwd remain separate from Paneon's own runtime storage.

**Why:** The user chose a fixed runtime directory rather than configurable storage locations.
**How to apply:** Keep CLI help, examples, implementation, and specifications consistent. Use ~/.paneon in user-facing path examples; do not present PANEON_HOME as an environment variable.
