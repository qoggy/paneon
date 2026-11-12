## ADDED Requirements

### Requirement: Show the current word wrapping state

CodeBlock SHALL use the same fixed 16px WrapText icon as DiffView in its existing 24px button. The button SHALL use secondary styling when wrapping is on and ghost styling when off. Its localized tooltip SHALL state the current wrap state and next action, and aria-pressed SHALL retain the boolean state. Existing defaults, initial-value lifecycle, copying and annotations SHALL remain unchanged. Markdown code blocks using the shared frame SHALL inherit the same controls.

#### Scenario: Toggle wrapping using the keyboard

- **WHEN** the user toggles the wrap button with Enter or Space
- **THEN** the selected background, tooltip and aria-pressed reflect the resulting state while the icon and source text remain unchanged

#### Scenario: Compare opposite component defaults

- **WHEN** CodeBlock and DiffView mount without defaultWrap
- **THEN** CodeBlock starts wrapped and DiffView starts unwrapped, and each toolbar exposes its own current state
