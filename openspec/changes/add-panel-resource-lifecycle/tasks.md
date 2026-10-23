## Design acceptance and contracts

- [ ] 1.1 Resolve B1–B3 in design.md, synchronize the chosen policy across proposal, specifications and tasks, and obtain explicit implementation authorization.
- [ ] 1.2 Confirm the actual implementation branch baseline and preserve other uncommitted work; do not reset the user's runtime home or migrate existing developer data without separate authorization.
- [ ] 1.3 Define shared instance/execution modes, status fields and error codes; remove old public status assumptions without adding compatibility branches.

## Persistence and immutable assets

- [ ] 2.1 Replace Store.get full-table decoding with indexed single-instance lookup and retain SQL list pagination; implement the new schema on isolated fresh runtime data.
- [ ] 2.2 Publish immutable content-addressed code artifacts shared across inputs; persist enough manifest, execution mode and dependency hashes to inspect and serve a sleeping instance without live execution.
- [ ] 2.3 Implement bounded manifest caching and persistent unreferenced-artifact candidates, including reference rechecks around concurrent build, serve, close and cleanup.
- [ ] 2.4 Unify atomic UI/resource configuration writes and CLI validation so one configuration update cannot erase the other's fields.

## Browser-owned review data and stateless submission

- [ ] 3.1 Define page-owned Git/PR source/evidence result schemas and reusable component props/callback boundaries; keep the generic annotation controller independent of Git and avoid opaque backend-session-only references.
- [ ] 3.2 Retain immutable displayed content/version references in browser memory while any draft targets them; keep selected historical data isolated from later query results and other instances.
- [ ] 3.3 Replace Git annotation validation against server snapshot Maps with pure validation of submitted source metadata, selected raw evidence, coordinates and complete correction payloads; do not re-read current working files to reinterpret old annotations.
- [ ] 3.4 Adapt PR description/check/diff targets to carry their originally displayed source evidence; avoid remote refetch during annotation validation. Make Git/PR read actions accept explicit source descriptors and bounded pagination arguments so they work after worker recreation without old session/listing/history Maps.
- [ ] 3.5 Cover file-level, hunk, line/text and PR object evidence, version-consistent refresh, malformed sources/ranges and current event/request limits; never silently truncate/split, automatically emit or persist unsubmitted client drafts. Do not add snapshot files or ActionContext dataDirectory for this change.

## Execution resource management

- [ ] 4.1 Add per-instance single-flight wake, generation guards and slot reservation; count starting instances, protected operations and transient build processes correctly.
- [ ] 4.2 Add bounded build/wake queues, explicit admission deadlines, LRU safe eviction and RESOURCE_BUSY handling without killing busy or persistent executions.
- [ ] 4.3 Add idle collection using one shared sweep and monotonic time; stop watchers, revoke secrets and release workers only after protected work completes.
- [ ] 4.4 Change run, static asset routes and startup restoration so auto-mode records do not create eager resident executions, while persistent restoration is bounded and does not block the service.
- [ ] 4.5 Preserve full Zod action/event semantics and explicit one-time dispatch after wake; protect validation and event append together and never replay ambiguous operations.
- [ ] 4.6 Implement resident-only source watching and wake-time source checks; no-watch remains pinned until explicit reload and unchanged-source wake preserves revision.

## Host, SDK and management UX

- [ ] 5.1 Add expiring per-client presence leases with multi-tab aggregation, proper Host/Origin checks and read-only WebSocket state notifications.
- [ ] 5.2 Add identity-checked host/SDK visibility messages, pause hidden auto-mode useQuery refresh and prepare interaction on visible return without retrying mutations or emit.
- [ ] 5.3 Preserve mounted iframes across execution transitions and integrate credential-prompt lease protection, preparation errors and safe explicit wake controls.
- [ ] 5.4 Update homepage, inspect/list summaries, resource counts and English/Chinese light/dark status text; retain explicit closed behavior and avoid permanent panel chrome.
- [ ] 5.5 Add the declared persistent-mode metadata, explicit panel wake CLI, resources configuration commands and read-only resource summary endpoint.

## Acceptance and documentation

- [ ] 6.1 Exercise many stored auto instances across runtime restart: no eager execution/build per historical record, indexed target reads, bounded cache and independent event consumption.
- [ ] 6.2 Verify leases, lost connections, two tabs of the same instance, hidden polling, pending credential input, long query/mutation, source changes and wake/suspend/close races with real browsers.
- [ ] 6.3 Collect worker count, RSS, FD/watcher count, build concurrency, cold-wake latency and annotation payload size/validation evidence for repeated creation/collection cycles; verify a plateau rather than asserting a fixed per-panel memory cost.
- [ ] 6.4 Verify eight protected slots, queue saturation, concurrent same-instance wakes, lower configured limits and persistent restoration without duplicate execution or automatic retry.
- [ ] 6.5 Validate real Git/PR annotations across worker termination while working files or remote PR content change, including exact raw ranges, failed saves, complete correction events and no retained backend business Maps. Verify reading another file, switching branch/commit and pagination also work after recreation; do not claim byte-consistency checks prove repository authenticity.
- [ ] 6.6 Verify artifact collection with live references, clock/restart boundaries, failed writes and disk permission errors; demonstrate that events, cwd and author data are not deleted.
- [ ] 6.7 Update the product skill, README, API examples and confirmed project memory to match the accepted lifecycle boundary; run appropriate static and integration checks and record exact evidence without claiming simulated behavior is implemented.
