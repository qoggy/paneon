## ADDED Requirements

### Requirement: Ship per-component references for the public UI package

The product skill SHALL include hand-written component references under `references/components/`: an `index.md` and one file per public component module of `@qoggy/paneon/ui`. Each component file SHALL contain exactly the sections `Use when`, `Import` and `Props`, in that order. `Use when` SHALL be one sentence on one line. `Import` SHALL list the exported names an agent uses from `@qoggy/paneon/ui`. `Props` SHALL describe commonly used props as a TypeScript excerpt and MAY omit props passed through to upstream components.

The index SHALL link every component file and give the same `Use when` sentence. The authoring reference SHALL link to the index instead of carrying per-component usage notes. Annotation APIs and `useUI` SHALL remain documented in the authoring reference.

Documented import names SHALL be exported by `@qoggy/paneon/ui`. Every exported value SHALL be documented in a component file or in the authoring reference, or SHALL be explicitly excluded as not intended for panel code. An automated test SHALL enforce these rules.

#### Scenario: Find and read one component

- **WHEN** an agent writing a custom page needs a dropdown choice
- **THEN** it can find `Select` from `references/components/index.md` and read its import statement and common props from one file without reading other component files

#### Scenario: An export is renamed

- **WHEN** a public UI export listed in a component file's `Import` section is renamed or removed
- **THEN** the automated test fails until the reference is updated

#### Scenario: A new component is exported

- **WHEN** a new value is exported from `@qoggy/paneon/ui` without a reference file, a mention in the authoring reference or an exclusion
- **THEN** the automated test fails

#### Scenario: A component file breaks the format

- **WHEN** a component file lacks one of the three sections, adds another section, or has a multi-line `Use when`
- **THEN** the automated test fails
