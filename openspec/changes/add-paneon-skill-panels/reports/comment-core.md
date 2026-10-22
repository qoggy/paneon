# Contextual comments — public UI delivery

## Scope

Implementation in the isolated `comment-core` worktree, based on `c10da98`. No SDK event schema, database, page business operation, dependency, or global theme changes. User-facing labels use 评论 / comment; the final submission action is **提交评论**. Internal `annotations`/`targets`/`comment` remain unchanged.

Public composition exported from `paneon/ui`:

- `FeedbackSurface`: one overlay per provider, no layout wrapper or inserted/split source Text nodes.
- `FeedbackSubmitButton`: optional `className`/`children`, default 提交评论.
- `FeedbackToolbar`: compact object selection, optional overall comment, comment directory and submission.
- `FeedbackControls`: compatibility composition of Surface + Toolbar; no old permanent editor/list section.

The controller additionally exposes read-only `selectionTargets`, so page-owned row/column checkboxes reflect pending selections. Optional synchronous `FeedbackAdapter.targetRanges(target)` supplies exact DOM ranges when semantic line-interval references differ from a whole-side text registration. It affects geometry only; retained snapshot validation still uses `resolve`/`locate` and existing event contracts.

## Behavior and root-cause fixes

- Native registered text selection only stages a nearby 评论 action. It does not create an annotation or emit an event. Clicking the action opens an independent buffer; Save creates/updates a draft, including an empty comment, Cancel/Escape discards only that edit, and Delete removes the saved comment.
- Each saved id receives a stable session number. Markers reopen the same editor; removing another comment does not renumber it. Multiple targets share one number. Overlapping markers are offset without changing source nodes or coordinates.
- Object selection is deliberately two-stage: first accumulate any number of targets, then click the toolbar’s 评论 action to open their editor. A full editor therefore cannot obstruct selecting adjacent rows or columns. Without a Toolbar, a custom page still receives the Surface action. Collapsed native selections from object clicks do not clear this pending set. Page-owned `toggleTarget` uses the same buffer as `FeedbackTarget`.
- Pending object selections or an open editor block submission instead of silently dropping input. Merely selecting/copying text does not block submission. Submission freezes the complete result, prevents duplicates and mutations, retains failed drafts, and emits only after the author’s explicit submit callback.
- Geometry uses registered original source boundaries, optional adapter ranges and the iframe’s actual viewport. It clips nested scroll containers and updates on registration, scroll, resize and DOM/layout changes. Detached/stale source registrations cannot receive old markers. The comment directory restores unmounted views through `locate`; it never edits or emits by itself.
- Initial Chrome inspection caught an editor first appearing at the viewport corner before moving to its target. Moving initial geometry/height measurement before paint fixed that jump. A later actual table test showed that changing popup direction alone could still cover selection controls; two-stage object selection fixes that cause.

## Verification

- `npm run build`: passed (also run by final `npm pack` prepack).
- `npm run typecheck`: passed, including Node tests without importing DOM implementation types into their Node-only project.
- `node --test tests/feedback.test.ts`: **5/5 passed**. Includes temporary buffers, public object toggles, pending/unsaved submission gating, cancellation, stable ids/numbers, overall comments and frozen explicit results.
- `npm run lint`: **0 errors**, 15 existing non-null warnings outside this change. Scoped changed-source lint: clean.
- `npm run format:check`: passed.
- Real Chrome `tests/browser/feedback.mjs`: passed against the worktree build and the independently installed package. Covers physical and keyboard selection, ordinary controls/copy, zero pre-save entries/events, empty Save, new/existing Cancel/Escape, Save/Delete, stable overlapping markers, multi-target object comments, repeated Chinese/emoji/grapheme and discontinuous/Markdown-style source mappings, source changes, unmount/remount, nested scrolling, actual DOM content reflow, narrow iframe, source-to-DOM range bridge, locate races, submission failure retention, frozen duplicate prevention and CLI events/ack.

Final package:

- `/tmp/paneon-comment-pack/paneon-0.0.0.tgz`
- npm shasum: `94a5d115208629a6f1f573799c7311bacb9953dc`
- Independent install: `/tmp/paneon-comment-installed.UmpdzJ/node_modules/paneon`
- Runtime/CLI used by browser validation are from that installed package, whose compiler resolves its own packaged UI. No source-tree UI or CLI fallback.
- Browser log: `/tmp/paneon-comment-installed-browser.log`
- Build/pack log: `/tmp/paneon-comment-final-pack.log`
- Lint and format logs: `/tmp/paneon-comment-lint.log`, `/tmp/paneon-comment-format.log`.
- Screenshots: `/tmp/paneon-comment-installed-screens/comment-action.png`, `comment-object-selection.png`, `comment-editor.png`, `comment-markers.png`.

## Changed files

- `src/ui/feedback-provider.tsx`
- `src/ui/feedback-store.ts`
- `src/ui/feedback-types.ts`
- `src/ui/feedback.tsx`
- `src/ui/feedback-geometry.ts`
- `src/ui/feedback-surface.tsx`
- `src/ui/index.ts`
- `tests/feedback.test.ts`
- `tests/browser/feedback-fixture.txt`
- `tests/browser/feedback.mjs`
- `skills/paneon/references/feedback.md`
- `openspec/changes/add-paneon-skill-panels/reports/comment-core.md`

## Boundaries

Chrome on this host was verified; Safari/Firefox are not claimed. Arbitrary unregistered DOM remains unsupported. Custom adapters remain responsible for semantic snapshot references and exact source mapping; `targetRanges` must return an empty array when the matching source is not mounted. In-memory browser drafts and the existing post-submit policy are unchanged. Standard-page Git/table/PR integration, JetBrains-style Git layout and their independent package evidence belong to `comment-pages` and main-agent acceptance.

Source implementation commits, in order: `b33de55`, `6a3fd7c`, `70d1f7d`, `c03e007`, `5671d84`, `4dbc140`. Tests, guide and this report are delivered by the following local commit. Nothing was pushed, merged into the parent worktree, or cleaned up by this unit.

## Main-tree acceptance follow-up

The main tree's full-height host exposed a fixture input precondition: after viewport resizing, a test-only button near the iframe bottom (DOM y=822–858 in a 900px frame) received no child-frame mouse events. Captured native mousedown/up/click events instead targeted the parent IFRAME element. Its handler never added the intended invalid annotation; submission therefore reached the deliberate-failure callback with only the previous three annotations. The comment editor was null and pending targets were empty, so this was not the unsaved-input gate.

The fixture now has half-viewport tail space and centers its late setup controls with ordinary scrolling before real mouse clicks. No force/evaluate-click, product/host change, retry, longer timeout or removed assertion was used. The negative test additionally waits for and verifies the exact invalid range (5..6, a lone low surrogate) before submitting and requiring the original stale rejection. The complete Chrome script then passed using the main tree's actual built runtime/UI/CLI. Evidence: `/tmp/paneon-comment-root-final.log`; diagnostic coordinates and event routing: `/tmp/paneon-comment-root-diagnostic.log`. This does not claim the same input anomaly occurs in an end user's normal browser.

The final screenshot path also centers the registered plain source explicitly and waits until marker 6's measured position has followed that source before its native click. `scrollIntoViewIfNeeded` alone could leave the source at the full-height iframe edge; the click returned without opening an editor. The existing first-painted-frame x/y assertions are unchanged. The complete script, including all functional assertions, CLI events/ack and four screenshots, passed against main's final independent package (`5a250b2af1459e746266139354802a43640e3dea`). Log: `/tmp/paneon-comment-final-installed-screens.log`. Screenshots: `/tmp/paneon-core-final-installed-screens/`. This follow-up changes only browser-test setup and this report; product/host files and the installed package are untouched.
