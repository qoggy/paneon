## Context

DiffView renders source cells in tables with fixed 24px rows and content-sized widths. Its split view measures actual source row heights to build a shared correspondence track, connectors and source overview scrollbars. CodeBlock provides the reference toggle and initial-value lifecycle; DiffView retains its own unwrapped default.

## Goals / Non-Goals

**Goals:** Retain `defaultWrap=false` while matching CodeBlock's internal state and existing toolbar controls; support split/unified and whole-file additions/deletions; preserve source nodes, logical lines and annotation coordinates through reflow.

**Non-Goals:** Controlled wrap props, cross-file/session preference storage, panel-specific state, new dependencies or annotation payload changes.

## Decisions

- Add only `defaultWrap?: boolean`, defaulting to false; initialize separate component state once. Updating the initial-value prop or source does not overwrite the user's choice while the component remains mounted. This matches CodeBlock rather than introducing a second state contract.
- CodeBlock and DiffView use the same fixed 16px WrapText icon and secondary/ghost state styling, retaining their existing icon-xs/icon-sm button sizes respectively. Markdown code blocks inherit CodeBlockFrame. DiffView adopts toolbar proposal A: grouped compact difference navigation, a separator, a side-by-side/unified radio menu showing the current layout, and fixed WrapText/FoldVertical icons. Wrap and hide-unchanged-lines options use secondary styling when on and ghost when off. Localized tooltips and aria-pressed expose their state; the context button also retains aria-expanded. Toolbar callbacks, rendering algorithms and defaults remain unchanged.
- Wrapped tables use their available width and fixed table layout. Source content uses `min-w-0`, `whitespace-pre-wrap` and `wrap-break-word`; inner highlighted text follows the same whitespace rules. Rows use a minimum height and top-aligned gutters. Unwrapped content retains the current width and horizontal scrolling.
- Pass the presentation state into DiffSplit so its layout effect measures committed reflow immediately. Keep the existing ResizeObserver, source offsets, connector and scrollbar algorithms. Hunk titles and end-of-file notes must also fit the width.
- Retain the current source renderer and annotation mapping. Replacing every diff row with CodeBlock would impose a separate code-block structure on the two-sided coordinate and correspondence layout.

## Risks / Trade-offs

- Variable source heights affect connected scrolling and annotation geometry → cover asymmetric wrapping, resizing, navigation and annotation ranges in browser tests.
- Enabling wrapping changes long-line geometry → retain existing default-horizontal-scroll fixtures unchanged and cover opt-in wrapping separately.
- Component reconstruction resets the initial value → retain CodeBlock's lifecycle rather than adding panel-level persistence.
