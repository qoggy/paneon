---
name: workflow-versioned-releases
description: Develop on separate branches, merge into MAJOR.MINOR.x version-line branches for release, and keep main at the highest released version
type: workflow
---

Keep `main` at the release commit of the highest published semantic version.

Each version line has a release branch named `MAJOR.MINOR.x`. Patch releases in the same version line share that branch:

- Release `0.0.1`, `0.0.2`, and other `0.0.*` versions from `0.0.x`.
- Release `1.2.1`, `1.2.2`, `1.2.3`, `1.2.4`, and other `1.2.*` versions from `1.2.x`.

Never develop directly on a `MAJOR.MINOR.x` branch. Do the work on a separate development branch, and merge it into the target version-line branch when preparing a release.

Tag the exact commit being released with `vMAJOR.MINOR.PATCH`, such as `v1.2.3`.
When publishing a new highest version, update `main` to its release commit. Publishing a maintenance release on an older version line leaves `main` at the higher released version.

**Why:** Version-line branches contain only content intended for release, while `main` remains the reference for the highest released version.
**How to apply:** Start development on a development branch, not on `MAJOR.MINOR.x`. Before releasing, merge the finished work into the target version-line branch. At release time, tag the release commit and update `main` only if the release becomes the highest published version. Compare semantic versions rather than publication dates.
