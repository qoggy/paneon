## 1. Component behavior

- [x] 1.1 Add defaultWrap and the CodeBlock-equivalent toolbar toggle with initial-value lifecycle.
- [x] 1.2 Implement split/unified/single-sided wrapping and measured layout updates without changing source identity.

## 2. Documentation and verification

- [x] 2.1 Document the public API and shared built-in panel behavior.
- [x] 2.2 Add browser coverage for wrapping, lifecycle, geometry and annotations; preserve explicit horizontal-scroll regression cases.
- [x] 2.3 Run builds, type checking, lint/format checks, relevant unit/browser regressions and OpenSpec validation; record actual results.

## 3. Visible wrap state (historical design B; DiffView superseded by section 4)

- [x] 3.1 Use the selected paired state icons and state/action tooltips in CodeBlock and DiffView, retaining ghost styling and existing defaults.
- [x] 3.2 Verify state-dependent icons, mouse/keyboard behavior and shared Markdown code controls; update documentation and evidence.

## 4. Diff toolbar proposal A

- [x] 4.1 Group difference navigation, replace layout buttons with a radio menu, and use fixed wrap/context icons with visible selected states in DiffView only.
- [x] 4.2 Update localized labels, documentation and existing browser interactions; verify the toolbar and retained diff behavior without adding runtime validation.

## 5. Unify CodeBlock with proposal A

- [x] 5.1 Use the same fixed wrap icon and selected background in CodeBlockFrame, retaining button size, defaults and copying behavior; remove the obsolete paired icon.
- [x] 5.2 Verify CodeBlock, Markdown code blocks and DiffView consistency, update specs/evidence, and amend the existing commit.
