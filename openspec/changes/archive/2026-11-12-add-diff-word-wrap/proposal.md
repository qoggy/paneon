## Why

Long paragraphs and source lines in Diff Review require horizontal scrolling, while CodeBlock already wraps by default. DiffView should retain its unwrapped default and offer CodeBlock-equivalent toolbar interaction without changing source text or annotation coordinates.

## What Changes

- Add `DiffView.defaultWrap`, defaulting to `false`, with component-owned toggle state.
- Unify CodeBlock and DiffView wrap controls with a fixed WrapText icon and selected styling; apply the selected proposal-A layout to DiffView with grouped navigation, a layout menu and a fixed context toggle icon.
- Wrap split, unified and single-sided content within its available width, retaining logical line numbers and measured diff geometry.
- Let Diff Review and Git Review inherit the public component behavior without panel-specific state.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `public-code-block`: Visible current wrap state through selected styling and a fixed icon shared with DiffView.
- `diff-review`: Optional word wrapping and a user-controlled presentation toggle, preserving source identity, navigation and annotations.

## Impact

Extends the public DiffView API while retaining its default long-line presentation. Affects the diff renderer, toolbar, split layout, shared code-block controls, component documentation and browser regression coverage. No new dependencies, panel input fields or submission payload changes.
