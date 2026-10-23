## Contracts and implementation

- [x] 1.1 Read design, the current Git read/annotation paths and relevant project memory; report proposed props/request/event examples before deep implementation, flag unresolved product choices instead of guessing.
- [x] 1.2 Replace session/listing/history/snapshot-dependent Git reads with explicit repository/version/path/cursor inputs; preserve fixed-tip pagination and existing file boundaries.
- [x] 1.3 Add reusable Git branch/history/changed-file components or co-located data wrappers with semantic props and callbacks; compose the built-in panel from them and demonstrate a minimal custom page.
- [x] 1.4 Make Diff usable from two strings without mandatory Git/source/session plumbing; keep annotation integration optional and preserve shared PR usage.
- [x] 1.5 Retain browser-owned displayed versions and build complete deduplicated annotation evidence; validate submission without old backend Maps or Git rereads; preserve comment/correction semantics and limits.
- [x] 1.6 Update skill documentation and design with exact exported props, request/result JSON and actual affected paths; no history compatibility layer.

- [x] 1.7 Freeze the built-in Git interaction/UI/layout against the base revision. Do not change visible controls/copy/defaults/spacing/panes/scrolling/loading feedback/keyboard behavior; demonstrate independent reuse only in test/example pages.

## Verification and acceptance

- [x] 2.1 Use local deterministic Git fixtures for changes/staged/untracked/history/compare/merge/rename/delete/binary/conflict and fixed-tip pagination; compare observable behavior to existing contracts.
- [x] 2.2 Prove a fresh isolated backend module/process can read the next file/page and accept retained browser-built annotations after working content changes, with no preloaded business Maps. Do not alter Runtime or terminate the user's running instances to simulate this.
- [x] 2.3 Check line/character/hunk/file targets, source association, duplicate evidence, malformed input, event limits, failures retaining drafts and complete replacesEventId corrections.
- [x] 2.4 Run real browser checks for lazy Diff, rapid commit selection and stale replies, full messages, graph/file trees/splitters, collapse, diff colors/navigation and Command+A; verify reusable components outside the built-in page.
- [x] 2.5 Compare before/after screenshots and real interaction flows to ensure no built-in Git UI/layout/interaction changes; verify light/dark and en/zh-CN with wide/narrow layouts; run shared Diff/PR regression without live external mutations.
- [x] 2.6 Run appropriate typecheck/build/lint/format and focused tests; record exact commands, logs and screenshots plus failures/limitations in verification.md. Do not add retry/timeout padding just to get green checks.
- [x] 2.7 Deliver a clean isolated worktree commit with full file list, architecture explanation, props/event examples and unresolved questions. Main agent performs independent CR and browser acceptance before integration.

Implementation evidence is complete; independent main-agent CR/browser acceptance and integration remain outside these executor checkboxes. See verification.md.

## Independent main-agent acceptance

- [x] 3.1 Main agent independently reviewed ownership/props/events, reran 33 focused tests and typecheck before and after integration, verified all 24 screenshot pairs, and exercised actual CUA lazy diff, preserved-content submission and independent components. See acceptance.md for exact evidence and limits.
