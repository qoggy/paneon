## Design acceptance

- [ ] 1.1 Confirm B14 finite worker reuse, B15 visibility/connection behavior and C2 generated-artifact reclamation; do not treat event38 as approval. B13 is the confirmed objective; B12 is withdrawn.
- [ ] 1.2 Verify implementation baseline and preserve unrelated changes. No source, SQLite-event deletion, DB migration or runtime-home reset.

## Bounded executor

- [ ] 2.1 Implement global FIFO admission, default2 workers and32 queued tasks; separate10s waiting deadline from30s execution deadline, including module startup.
- [ ] 2.2 Pin each thread to one serverEntry/revision, prefer matching idle workers, retire mismatched idle workers before replacement and never exceed the cap during termination. Never import panel code on HTTP main.
- [ ] 2.3 Reuse success paths with per-job signal/credential cleanup; reclaim after60s idle,100 calls or5min age at a safe task boundary. Do not promise automatic cleanup of arbitrary detached work.
- [ ] 2.4 Retire failed/cancelled/old-revision workers; handle exit/error/timeout with one settled outcome and mutation RESULT_UNKNOWN without replay.
- [ ] 2.5 Add ctx.cwd/timeoutMs and bounded config, preserve secrets and full Zod semantics across reuse, and keep compilation bounded separately.

## Storage and page activity

- [ ] 3.1 Use indexed target reads and SQL list projection without parsing all params; serve existing static artifacts independent of resident executors; cap manifest cache32/8MiB.
- [ ] 3.2 Remove eager historical module evaluation/build and per-panel persistent execution environments. Preserve explicit run/reload/close and no-watch.
- [ ] 3.3 Subject to C2, retain current/previous successful generated versions plus live browser/job references, reclaim released versions and failed temporary builds without deleting source or events.
- [ ] 3.4 Subject to B15, derive source-watch references from visible existing state sockets, close panel/preference notifications while hidden, and reconnect/read current state on visible return. Reuse existing15s protocol liveness; no additional HTTP presence polling.
- [ ] 3.5 Pause only explicitly configured refreshMs timers while hidden, restore at most one query without overlap, and never cancel or replay started business operations merely on visibility changes.
- [ ] 3.6 Remove PR-required business Maps, use explicit cwd/fixed versions, preserve browser-held original content and all Git/PR UI/props. Do not add or remove the separate Git checkFeedback action as part of this task.

## Acceptance and guidance

- [ ] 4.1 With fixed historical counts, exercise1/5/10 active panels and prove worker/cache/watch bounds and stable RSS/FD after repeated workload, not immediate zero after every call.
- [ ] 4.2 Verify three parallel same-panel calls create at most two workers and reuse the third; repeatedly switch ten revisions and prove one-version-per-worker and correct replacement.
- [ ] 4.3 Verify module/handler exit and sync loops while real HTTP responds, bounded cancellation and credentials/context isolation across reused jobs.
- [ ] 4.4 Verify hidden/visible/multi-window/disconnect/reload state, absence of new presence polling, optional query behavior and browser draft retention.
- [ ] 4.5 Subject to C2, verify compiled-version retention/reference safety, failures and stale build cleanup, while historical events remain readable.
- [ ] 4.6 Validate built-in bundles/Zod/native dependencies/cwd/Git/gh cancellation, actual cold/warm and commit-click end-to-end latency, and browser UI invariance. Distinguish prototype results from product acceptance.
- [ ] 4.7 Update authoring/CLI/examples and themed bilingual diagnostics to the accepted contract.
