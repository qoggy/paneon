# B58 — Git selection performance review

## Report and confirmed trigger

The user reported that macOS Command+A in the Git Diff caused the page to crash. The exact original renderer failure was not reproduced: the original file, focus and subsequent gestures were unknown. The investigation did not reload the user's existing instance or modify its drafts.

In an isolated real Git repository and Chrome, native Meta+A with focus in a Diff scroll pane and native Meta+C both worked. The current document selection collector does not run on the A keyup. A subsequent native Shift release does run it and exposed a severe main-thread stall. This is evidence of a reproducible blocking path after full selection, not proof that Meta+A alone terminates the renderer.

A 300-line single-sided TypeScript Diff had 22,470 UTF-16 characters and 3,900 highlighted spans. Its selection collector took 4,123 ms, with a 4,118 ms long task and a subsequent 931 ms geometry task. Native Meta+A took 16 ms. Under the same conditions, endpoint-only grapheme checks and first-anchor measurement reduced the collector to 106 ms.

A 1,200-line single-sided Diff had 91,470 UTF-16 characters and 15,600 spans. Saving the full selection initially took 6,979 ms, including 3,831 ms and 2,734 ms geometry tasks. After the complete fix, selection collection took 93 ms and saving took 527 ms in the recorded run.

## Causes and changes

- Selection mapping split and enumerated the complete source for every highlighted Text node. Use the two containing endpoint graphemes and reuse one `Intl.Segments` object per source during collection. Preserve UTF-16 positions, full quotes and grapheme boundaries.
- Each saved target scanned every registered segment. Build an interval bounds index at registration, query only intersecting candidates and retain original DOM order. The original null/discontinuous/repeated/constant boundary maps still determine the exact range.
- Geometry created thousands of temporary live DOM Range objects. Later syntax DOM replacement made Chrome update those ranges; a real iframe CPU profile recorded 15.6 seconds in React `setTextContent`. Reuse one private measurement Range per document. It is separate from native selection and CSS location highlights. The repeated mutation hotspot disappeared in the follow-up profile.
- Geometry repeatedly read the same clipping ancestors, and the contextual bubble requested all rectangles twice. Cache clipping bounds only within a synchronous measurement, skip rectangles wholly outside the iframe viewport and stop bubble anchor lookup after the first visible rectangle. A successfully mapped offscreen text range stays offscreen instead of repeating an adapter scan.
- Source registration changes synchronously measured temporary half-unregistered views. Coalesce them into the next animation frame, after the registry settles. Diff registration depends on the stable `registerText` callback rather than the changing feedback snapshot.
- Diff feedback validation enumerated every grapheme for each target. Check only its endpoints. Retain quote validation, line-relative delivery, snapshot checks and existing HTTP/event size limits.

No keyboard shortcut is blocked. No selection is truncated, no exception is swallowed, and ordinary selection/copy does not save or emit a comment.

## Regression evidence

`tests/browser/git-select-all.mjs` uses a real Git repository with 600 changed TypeScript lines per side (47,070 UTF-16 characters per side; 15,600 highlighted spans), a real Chrome browser and native Meta+A/Meta+C. It reads the actual system clipboard through the permitted host document; the iframe keeps its existing clipboard permissions policy.

Recorded full regression: split collection/paint 145 ms; unified 157 ms; expanded selection mode 143 ms; full-selection save 458 ms. Native selection and copying include the first and last source lines, combining marks and the full family emoji. Save/edit/Cancel, source remounting and subsequent interactions work. Oversized full feedback is rejected by the existing HTTP/event bounds while retaining the draft. A new precise emoji comment submits successfully with exact normalized source coordinates. No pageerror or renderer crash was observed.

The regression keeps explicit collector/save bounds and records long tasks. It is not a promise that every arbitrary repository or the maximum permitted file size is stall-free. The original user-reported renderer termination remains unconfirmed.

Additional checks cover all endpoint positions across ASCII, combining marks, CRLF, ZWJ emoji, flags and skin tones; interval lookup with null/discontinuous/overlapping/constant mappings and original DOM order; the existing feedback, Markdown, table and Git suites.

Temporary evidence logs: `/tmp/paneon-b58-before.log`, `/tmp/paneon-b58-after-first.log`, `/tmp/paneon-b58-save-before.log`, `/tmp/paneon-b58-final-perf.log`, `/tmp/paneon-b58-selectall-pass2.log`. CPU profile: `/tmp/paneon-b58-all.cpuprofile`. Screenshot: `/tmp/paneon-b58-select-all.png`. These are local acceptance artifacts, not shipped runtime files.

## Verification status at task handoff

- Full build/typecheck, scoped ESLint, formatting and diff checks passed. The related Node suites passed 38 tests; the two new endpoint/index tests were also rerun after final test typing/CRLF cleanup.
- The complete existing `tests/browser/feedback.mjs` passed, including native/keyboard selection, Markdown/table mappings, empty Save, Cancel/Delete, nested clipping/narrow layouts, stale snapshots, locating races and explicit events/ack.
- The dedicated Git select-all regression passed as described above.
- The original complete Git browser run passed its semantic/comment/CLI portion but stopped waiting 30 seconds for the layout fixture's first history query. An isolated diagnostic observed that action return HTTP 200 in 7,791 ms; the pending condition was not reproduced. Subsequent real queries also returned. The isolated run then reached an old B57 drag-test point covered by the comment textarea. That older layout acceptance is not claimed to pass here; the parent must run the combined current B59/B60 layout. Neither its selectors nor the Git query implementation were changed as part of B58. See `/tmp/paneon-b58-git-browser.log` and `/tmp/paneon-b58-git-diagnostic.log`.
