---
name: workflow-versioned-releases
description: Develop on version-line branches and keep main at the highest released version
type: workflow
---

Keep `main` at the release commit of the highest published semantic version.

Develop and maintain each version line on a branch named `MAJOR.MINOR.x`. Patch releases in the same version line share that branch:

- Develop `0.0.1`, `0.0.2`, and other `0.0.*` releases on `0.0.x`.
- Develop `1.2.1`, `1.2.2`, `1.2.3`, `1.2.4`, and other `1.2.*` releases on `1.2.x`.

Tag the exact commit being released with `vMAJOR.MINOR.PATCH`, such as `v1.2.3`.
When publishing a new highest version, update `main` to its release commit. Publishing a maintenance release on an older version line leaves `main` at the higher released version.

**Why:** Maintain version lines independently while keeping `main` as the reference for the highest released version.
**How to apply:** Choose the version-line branch before development. At release time, tag the release commit and update `main` only if the release becomes the highest published version. Compare semantic versions rather than publication dates.
