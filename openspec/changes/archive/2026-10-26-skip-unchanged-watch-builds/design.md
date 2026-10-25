## Context

`prepare` already reuses cold artifacts, but watched changes enter the same forced path as explicit reload. A source hash alone misses newly selected import targets, package changes and damaged outputs. A cache hit can also leave a prior diagnostic behind.

## Goals / Non-Goals

**Goals:** Skip unchanged automatic rebuilds, preserve execution, retain explicit forced reload, and clear recovered build errors.

**Non-Goals:** Historical revision lookup, startup warming, new worker policies, business validation, or detecting arbitrary external data read by author functions.

## Decisions

- Add optional reuse evidence to successful manifests: hashes of the files read by TypeScript/Vite and relevant compiler/package/environment inputs, file-existence probes used during resolution, and generated output hashes. Record actual inputs without recursively scanning project or dependency directories.
- Capture missing resolution candidates as well as existing inputs, so adding a higher-priority local module invalidates reuse. Package metadata and dotenv candidates participate in the evidence. Environment values are represented by a digest, not stored verbatim.
- Decide reuse inside the existing per-panel build queue. Watch refresh checks evidence; explicit run/reload remains forced. An absent or changed record is a normal cache miss and uses the existing compiler process and compilation admission.
- Keep no-watch cold source behavior. Watch reactivation uses the same evidence as active watch updates. A successful hit clears a previous build diagnostic and publishes completed state, without replacing execution.
- Preserve source revision semantics and the existing snapshot publication check. New metadata does not grant authenticity or introduce request validation/errors.

An automatic cache hit keeps the existing watcher subscription and execution state. Explicit run/reload still compiles and validates; explicit reload replaces execution even when the resulting revision is unchanged. Missing or changed evidence takes the normal compiler path rather than rejecting package or environment changes through new business rules.

The base update and in-flight call boundaries remain in [the runtime design](../add-code-first-interactive-runtime/design.md#自动-reload-由-agent-按面板选择). Watch subscriptions and local change recovery are maintained in [the source-watching design](../reduce-bundles-and-fix-source-watching/design.md).

## Risks / Trade-offs

- Additional input/output reads cost more than hashing author sources alone. Measure this against full compilation and keep work asynchronous in the runtime.
- Older manifests lack evidence and take one normal rebuild on watch activation; no database migration is needed.
- Runtime data read outside imports remains author-owned and can be refreshed with explicit reload. Mutable external data is not part of a compilation cache.
- Cache probing cannot make filesystem reads atomic with future edits; file watching and the existing queued source snapshot checks retain their update model.
