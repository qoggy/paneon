# Verification

## Initial implementation checks

- `npm run build:ui` and `npm run build:web`: passed.
- `npm run typecheck`: passed.
- `npm run lint`: passed with 0 errors and 64 existing non-null-assertion warnings. Scoped ESLint for changed source and test scripts passed without warnings.
- Prettier check for changed supported files and this change's artifacts: passed.
- `git diff --check`: passed.
- `openspec validate add-diff-word-wrap --strict`: passed.
- The five related Node suites (`diff-presentation`, `diff-changes`, `diff-annotation-references`, `diff-block-annotations`, `diff-review`): 28 tests passed.
- Desktop Chrome suites: `diff-wrap`, `diff-layout`, `diff-connected`, `diff-scrollbars`, `diff-reading`, `diff-toolbar`, `diff-annotations`, `diff-review`, `diff-resize`, `code-block` all passed. Existing optional mobile checks were excluded with `PANEON_TEST_DESKTOP_ONLY=1`.

## New behavior covered

`diff-wrap` checks the actual public component's initial wrapping behavior, CodeBlock-equivalent icon/button/tooltip semantics, keyboard and pointer toggling, source and text-node identity, no query/submission side effects, asymmetric heights, divider/window resizing, measured track bounds, navigation after reflow, unified/context/single-sided/document layouts, unbroken URLs, tabs, CRLF, combining marks and emoji. It saves and submits a multi-visual-line annotation and compares the raw source quote and UTF-16 coordinates. Initial-value prop updates and reconstruction are checked against the real CodeBlock lifecycle.

## Visual and integration check

Opened the actual built-in Diff Review with a temporary TypeScript comparison containing Chinese paragraphs and long URLs. Confirmed one wrap button, initial wrapping, fitting code panes and restored horizontal scrolling when disabled, with no browser page errors. Inspected the rendered screenshot. The existing `diff-resize` suite also passed the Git Review changes/compare and Diff Review workspaces with wrapping enabled by the earlier default.

The full release/package installation suite was not run; no publishing was performed.

## Default-off adjustment

The final default is `defaultWrap=false`; CodeBlock retains `defaultWrap=true`. Removed now-unnecessary explicit false props from the four existing horizontal-scroll fixtures. The browser test now checks the omitted prop, explicit true/false, and the unchanged CodeBlock default. The initial matrix above was run before this adjustment. Follow-up checks passed: UI build, project type checking, scoped ESLint, Prettier, strict OpenSpec validation, and the desktop `diff-wrap`, `diff-review` and `code-block` browser suites. The actual built-in preview was also checked: initially unwrapped with horizontal scrolling, and wrapping works when the toolbar button is enabled.

## Selected design B: visible current state

Implemented the reviewed icon pair in a private WordWrapIcon shared by CodeBlockFrame and DiffToolbar. The existing 24px ghost buttons now show 14px straight-through/returning arrows for off/on; there is no selected background or border. Localized tooltips describe the current state and next action. Defaults remain CodeBlock=true and DiffView=false. Markdown code blocks inherit the shared frame.

Follow-up checks passed: UI build, project type checking, scoped ESLint, strict OpenSpec validation, and desktop Chrome suites `diff-wrap`, `code-block`, and `markdown-highlighting`. Browser assertions verify opposite-state icons differ, equal states use the same geometry, keyboard toggles update the icon, and ghost styling is retained. A separate actual-component preview confirmed unchanged defaults, 14px geometry and matching icons after toggling; its screenshot was visually inspected. No new runtime validation, fallback, retry or settings were introduced.

## Diff toolbar proposal A

The user subsequently selected proposal A for DiffView's interactions and layout. This supersedes DiffView's paired icons and ghost-only styling described above. CodeBlock and Markdown code blocks retain their existing controls and defaults.

DiffView now groups compact difference navigation separately from display options. A radio menu shows and selects the current comparison layout. Fixed WrapText and FoldVertical icons use icon-sm buttons and secondary styling when wrapping or hiding unchanged lines is enabled. Localized tooltips and pressed states describe the controls; the context toggle retains aria-expanded. Choosing the current layout still invokes the original callback and reveals the current difference. No diff algorithm, source lifecycle, default, public prop, payload or runtime validation changed.

Checks performed for proposal A:

- UI build and project type checking: passed. The first type check overlapped the UI build's declaration-file replacement and reported missing dist declarations; it passed after the completed build, without a source workaround.
- Scoped ESLint, Prettier checks and git diff whitespace checks: passed.
- Strict OpenSpec validation: passed.
- Impeccable mechanical scan of DiffToolbar: no findings.
- Desktop Chrome suites diff-toolbar, diff-wrap, diff-annotations and git-review: passed. The final toolbar run covers menu radio states, keyboard opening/selection, reselecting the current layout, grouping, context selected styling, navigation boundaries, same/binary source behavior and preserved annotations. Existing wrap coverage checks source/node identity, raw coordinates and layout geometry.
- Updated other existing browser scripts to use the menu, compact counts and fixed context-control label; those additional suites were not run in this task.
- Inspected the actual component's desktop screenshot. No release, package installation, mobile-specific test or publishing was performed.

No new runtime validation, retry, fallback, exceptional exit or settings were introduced. New conditionals only present the existing layout/wrap/context/navigation state; callbacks retain their previous behavior.

## Unified proposal A for CodeBlock

The final approved presentation also applies proposal A to CodeBlock and Markdown code blocks, superseding their paired icons and ghost-only styling recorded above. Both components now use DiffView's fixed 16px WrapText icon, secondary styling when wrapping is enabled, and ghost styling when disabled. CodeBlock retains its existing 24px button, wrapped default, tooltip semantics, state lifecycle, copying and source annotations. The unused private paired-icon module was removed. No new runtime validation or behavioral restrictions were added.

Passed checks: UI build, project type checking, scoped ESLint, Prettier, git diff whitespace checks, strict public-code-block specification validation, and desktop Chrome suites code-block, diff-wrap and markdown-highlighting. The suites verify fixed icon geometry, selected backgrounds, cross-component consistency, unchanged opposite defaults, keyboard toggling, copying and raw annotation coordinates. CodeBlock screenshots were inspected in light and dark themes. Impeccable's mechanical scan reported no findings. No full release suite or publishing was performed.
