---
name: tech-panel-version-requirements
description: Panels declare a compatible Paneon package range instead of a separate SDK generation
type: tech
---

# Panel version requirements

Paneon CLI, SDK, components, compiler, and local service share one npm package version. Panel source declares its dependency through `requires.paneon`, using an npm semver range such as `>=1.4.0 <2.0.0`; the numbers are illustrative, not a release target. Do not introduce a separate numeric SDK generation field.

A matching range permits further type checking and compilation; it does not prove behavioral compatibility. An unsupported installed version must produce an explicit error. Do not silently fetch an older SDK, switch versions, widen the range, or rewrite source. During 0.x development, declare ranges based on versions actually verified rather than assuming all 0.x APIs are compatible.

**Why:** Reusable panel source outlives individual CLI installations. A major-generation integer cannot express the minimum version containing an API, and a single exact version cannot express an accepted upgrade range.
**How to apply:** Keep source examples, manifests, compiler checks, and agent documentation consistent with requires.paneon. Keep package dependency checks separate from internal CLI/service protocol checks; a running old service does not become the new version merely because the installed package was upgraded.
