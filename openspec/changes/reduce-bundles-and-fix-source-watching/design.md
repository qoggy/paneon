## Context

Research isolated the unused chunks to cycles introduced by the UI prebundle and confirmed dropped add/unlink events, failed dependency recovery and env-triggered Vite restarts. Existing Runtime already serializes per-panel builds, compiles independently and limits hot residency to ten panels.

## Goals / Non-Goals

**Goals:** Eliminate unused rich-content output through normal library boundaries; share precise hot-panel subscriptions; recover local source edits and reflect production env changes in browser revisions.

**Non-Goals:** Cross-panel browser chunks, minification, zod entry changes, package-manager watching, action retries, stronger in-flight action guarantees, new business rejection rules or database migration.

## Decisions

1. Preserve modules in the UI library build. Leave ordinary bare package imports external, while Mermaid/React Markdown/remark-gfm and their dependencies retain existing library-stage compression. React remains external throughout. Final panel builds still bundle locally. An all-external prototype reduced the basic sample by 81% but increased a Markdown+CodeBlock sample from 9.96 MB to 13.27 MB; the selected boundary reduces the basic sample by about 80% and limits the rich sample to about 10.55 MB. The library has more module files, avoiding the dynamic cycles introduced by concatenation. Avoid a post-build graph-pruning plugin and its dependency on stale dynamic-import metadata.
2. Add local watch evidence to SourceSnapshot. Track authored reads and relative resolution probes explicitly, separately from the broad cache-reuse snapshot. Capture production env candidates before typechecking. Existing env files become source dependencies and therefore affect revision.
3. Publish optional watch evidence in manifests and in private compiler IPC on both success and failure. Existing manifests can derive subscriptions from their successful dependencies until rebuilt. Compiler failures remain unchanged public diagnostics.
4. Runtime owns one lazy Vite watcher with env/public/HMR disabled. Strict path filtering, shallow traversal and canonical parent resolution avoid recursive project scans and match path aliases. Subscription handles update in place and close independently; path sets retain other panels' subscriptions.
5. Keep the last successful subscription set plus only the latest failed attempt. Reconcile against the latest attempt's fingerprints, rather than stale successful contents, so a continuing compile error does not cause an automatic rebuild loop. Events during rebuilding set one pending dirty flag; they never replay actions.
6. Add subscriptions before removing old ones and reconcile captured inputs after updating subscriptions. The stable subscription handle survives successful replacement and cache hits, while worker replacement continues through the existing Runtime path. Close does not wait for its own callback and therefore cannot deadlock retirement.
7. Physical directory registrations remain while other subscriptions reference their descendants. Chokidar unwatch remembers ignored prefixes, so a later child subscription reactivates the retired directory prefix. The last subscriber closes the shared server and releases that bookkeeping.

Production env candidates are `.env`, `.env.local`, `.env.production` and `.env.production.local`. Watch all four candidates for creation, deletion and restoration without restarting Vite's env loader; existing files participate in source revisions. Package installation and toolchain changes continue to require explicit reload or cold-activation checks rather than package-manager watching.

Keep final browser dependencies bundled locally per panel. The selected UI library boundary avoids the dynamic-entry cycles seen with module concatenation in the current Rolldown and the larger unminified rich-content output seen with broad externalization. Do not replace it with post-build chunk pruning or browser CDN/shared-asset loading.

Update reuse follows [skip-unchanged-watch-builds](../skip-unchanged-watch-builds/design.md). Residency and LRU follow [add-panel-resource-lifecycle](../add-panel-resource-lifecycle/design.md): retiring a panel releases only its subscriptions, and watcher-only updates do not create execution children. Source updates retain version/identity checks, durable events and consumer positions without retrying mutations.

## Risks / Trade-offs

- UI dependency externalization affects consumers → real browser UI/Markdown/Mermaid and independently installed package acceptance.
- Chokidar's macOS depth calculation counts exact files at depth one → use depth one plus strict allowed-path filtering; test real file events.
- Subscription changes and failed builds can race saves → fingerprint reconciliation, coalesced invalidation and controlled tests for saves during compilation and queueing.
- Shared subscriptions can leak or interfere → independently close handles on LRU/close, close service at stop, assert shared-file and cold-path accounting.
- Environment changes require browser remount → hash existing production env files as source dependencies and verify rendered values automatically change.
