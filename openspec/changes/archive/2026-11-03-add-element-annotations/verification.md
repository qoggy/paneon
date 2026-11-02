# Verification

## Result

The approved interaction is implemented in the shared page session. The live preview now uses the actual project components instead of its prototype picker. No commit, release or archive was performed.

## Checks

- `npm run build`: passed, including CLI, UI declarations, typecheck and web build. Vite retains its large-chunk advisory.
- Targeted Node tests: 68 distinct tests passed across annotation API, element/media annotations, file/diff/Git/table review, repository feedback and the GitHub PR example. Final element/PR rerun: 15 passed.
- Browser suites passed: `element-annotations`, `media-annotations`, `annotation-api`, `annotation-drag`, `annotation-editor`.
- Element browser coverage includes click interception, icon tooltip, parent/child keyboard selection, adjacent popup, nested scroll, layered Escape/Cancel, existing editor, card bounds containing SVG, explicit id-free agent events, and selection/saving within a translated media viewer.
- `openspec validate add-element-annotations --strict`: passed.
- Formatting checks on all changed/new project text files and `git diff --check`: passed.
- ESLint on changed/new JS/TS files: no errors; 18 non-null-assertion warnings in existing review code/test expressions remain.

## Resolved integration findings

- Zod refined annotation schemas cannot use `.omit()` directly: the test page now composes its event from the common target/comment shapes, as existing panels do.
- The compiler's server SDK entry also needs the element-ref exports; these are now exported consistently from all three SDK entries.
- A translated media dialog can acquire scroll during focus movement. The measured failure was a 10px scroll and 10px outline offset. The shared viewport conversion now includes dialog border and scroll offsets, and the same helper serves existing markers and element outlines.
- Element references bypass author-only resolve, locate, targetRanges and source-evidence checks. They retain their actual node and never close a currently open file preview merely to locate that node.

## Focus boundary

The added schema identifies the agreed `{element:{path,tag,excerpt}}` shape and composes it with the existing author schema. There are no new path-pattern, page-version, stale-content or excerpt-length rejection policies. Picking excludes annotation controls and uses visible, distinct-bounds ancestors as in the reviewed prototype. Existing disabled/submitting/editor protection and author source validations remain in force.

`ELEMENT_ANNOTATION_EXCERPT_LENGTH` in `src/ui/element-annotation.ts` is the single implementation constant. Excerpt tests derive their data and expectations from that constant, so changing it does not require updating test magic numbers. DOM paths always use the page body as their root; source mapping and cross-refresh recovery remain outside this change.

## Range visibility and editor positioning follow-up (2026-11-03)

The approved boundary prototype is now implemented in the shared annotation surface. Saved element targets retain a 1px faint outline, matching marker/directory hover or focus emphasizes it at 2px, and an open editor takes precedence. The actual element's border radius is retained. No fill or pointer interception is added. Nested boundaries remain independent; deletion removes the matching marker and outline. The preview now only seeds local drafts and uses product rendering, with its temporary boundary renderer removed.

The editor-position mismatch was reproduced at a fixed 1100×800 viewport: opening the same annotation from its marker placed the editor at (731, 231), while directory editing placed it at (549, 432). Marker clicks passed a marker anchor; directory editing omitted that anchor and used the whole object's bounds. Directory editing now passes the corresponding target's marker identity after its existing location wait. Both routes were measured at (731, 231) after the fix.

Follow-up validation:

- Full `npm run build` passed, including typecheck; the existing large-chunk advisory remains.
- 11 targeted Node tests passed: element annotations, annotation API and media annotations.
- Browser suites `element-annotations`, `annotation-editor` and `media-annotations` passed. Added coverage checks nested saved boundaries, matching radii, hover/focus/editor emphasis, pointer pass-through, nested scrolling, deletion and equal editor positions from both entry points. Existing text/media editor behavior and submission checks remain passing.
- The source-based live preview has two product-rendered boundaries, no prototype overlay and no browser errors. Both editing entries were measured at identical coordinates.
- Changed-code ESLint, formatting, OpenSpec strict validation and `git diff --check` passed.

No commit, archive or release was performed.

## Unavailable-target editing and floating-tab reproduction (2026-11-03)

Implemented only the agreed unavailable generated-element editing behavior. Before the change, hiding the SVG in the live preview placed its editor at (0, 8); removing it prevented directory editing from opening an editor. Generated-element directory editing now checks rendered visibility before location. Hidden/removed targets open the original editor at the viewport's bottom-right with 16px clearance, preserving the saved id and targets. Offscreen rendered targets retain scroll-to-target and marker positioning. Save/cancel/delete, author-defined source/media validation, payloads and submission remain on the existing paths. Target disappearance during an open editor, automatic view restoration and node replacement matching are outside this follow-up.

Validation:

- `npm run build` passed, including typecheck and web build; the existing large-chunk advisory remains.
- 11 targeted Node tests passed (element annotations, public annotation API and media annotations). The existing element mock now supplies the native visibility method used by the UI.
- Browser suites `element-annotations` and `annotation-editor` passed. New coverage checks hidden-target cancellation/save, restored same-node location, offscreen scrolling, removed-target editing/save/delete and unchanged targets/explicit submission.
- The source preview includes Hide/Show/Remove controls for direct inspection and a screenshot of the bottom-right editor.
- Changed-code ESLint, formatting, strict OpenSpec validation and `git diff --check` passed.

Floating-tab positioning and overlap were reproduced with current product components in a separate minimal page. At 1100×800, a 1400px block centered at y=−300; the 24px marker sat at y=0 and its editor occupied y=32–130, overlapping a full-width 72px fixed tab bar. Rectangle-intersection assertions and screenshots confirm both issues, with no browser errors. See [the reproduction report](positioning-reproduction.md). The original user page was not available with that tab layout; this is a controlled minimal reproduction. No production positioning or sticky-header avoidance was changed.

## Height-aware location and automatic top-bar avoidance (2026-11-03)

The subsequently authorized implementation follows the user's height-based idea: short generated-element targets are centered as a whole; tall targets center their opening half-screen portion. Common wide fixed/sticky top bars are measured without author configuration. Marker clipping and the existing editor's collision padding share that measured available region. The heuristic intentionally covers common top bars rather than arbitrary side panels or irregular overlays. Inline scroll margins are restored after native scrolling, and a newly pinned sticky bar receives one measured correction before editing opens.

At the original 1100×800 preview with its 72px bar, the 1400px target now starts at y=260, its marker at y=242 and its editor at y=274. Switching the same live target to 180px places its top at y=346 and center at y=436, centered in the usable y=84–788 region. The preview now includes height-switching controls, and `verify-positioning.mjs` generates separate tall/short screenshots and measured evidence. No browser errors were observed.

Checks:

- `npm run build` passed, including typecheck; the existing large-chunk advisory remains.
- 11 targeted Node tests passed: element references/payloads, public annotation API and media annotations.
- Browser suites `annotation-positioning`, `element-annotations`, `annotation-editor` and `media-annotations` passed.
- The new focused positioning suite covers tall upper-content focus, short full-content centering, fixed bars, bars becoming sticky during location, resized bars, manual scrolling, ordinary/hidden header exclusions, narrow floating-action exclusions and restoration of authored inline margins.
- Existing element selection, nested clipping/scrolling, equal marker/directory edit placement, hidden/removed-target bottom-right editing, original editor protections, media viewers and retained file snapshots remain passing.
- Changed-code ESLint, formatting, strict OpenSpec validation and `git diff --check` passed.

No release, commit or archive was performed.

## Independent Kiro audit and corrections (2026-11-03)

`conduct` workflow `run-kiro` audited the full 57-file working change, including staged, unstaged and untracked files, with particular attention to Skill instructions and the user's focus constraint. Run `run-kiro-20261103-010533` completed with B, zero Critical, five Warning and seven Info. The original report is preserved in the task's audit output directory `/tmp/paneon-annotation-audit-20261103/kiro-review.md`.

All five Warnings were addressed: explicit reselection replaces a stale node registration; horizontal sticky Diff gutters are excluded from top-bar candidates; CLI coverage diagnostics distinguish source/range coverage from whole-element picking; built-in panel references document element opinions and correction withdrawal semantics; authoring explains common-schema derivation and element-reference narrowing. Additional corrections cover file-preview content picking and element outlines, the unavailable-element error wording, author-facing internal-constant noise, adapter scope wording and unused locale entries.

Before correction, targeted browser regressions reproduced the detached-node outline timeout and the file-preview range-picker timeout. Both paths now pass. The original Enter contract and session-lifetime registration strategy were deliberately retained; no lifecycle, retry, automatic recovery or new business validation framework was added. The complete decision inventory and per-finding disposition are preserved beside the original report as `focus-decisions.md` and `resolution.md`.

The complete build/typecheck passed. After the final CLI wording adjustment, CLI build and 26 targeted Node tests passed. Element selection/reselection, positioning and full file-reference browser suites passed. A Chromium check with 6000 horizontal `sticky; top:auto` nodes found zero such nodes in top-bar candidates while real top bars remained detected. The modal pointer regression now includes ARIA-hidden background controls in its selector, still using normal Playwright mouse actions without force.

The 16-file targeted Kiro recheck, run `run-kiro-20261103-012805`, completed with A-, zero Critical and zero Warning; all five original Warnings are resolved. Its two Info items were handled by deleting unused locale entries and clarifying validation ownership. The main agent ran all five relevant browser suites successfully (element, positioning, file references, editor and media); Kiro read the resulting logs but did not independently rerun them. Original reports and the final decision inventory remain in the task audit directory. Existing user staging was preserved; no commit, staging, release or archive was performed.
