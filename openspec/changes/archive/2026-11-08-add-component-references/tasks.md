## 1. Consistency test

- [x] 1.1 Add `tests/component-references.test.ts` that lists `src/ui/index.ts` exports with the TypeScript checker and parses `skills/paneon-visualize/references/components/*.md`.
- [x] 1.2 Assert every `Import` name is exported, every exported value is documented in a component file or listed in a reasoned allowlist (annotation APIs and `useUI` documented in `authoring.md`; host-only names such as `UIProvider` after confirming the host renders them).
- [x] 1.3 Assert each component file has exactly `Use when`, `Import`, `Props` in order with a one-line `Use when`, and `index.md` links every file once with the matching sentence.

## 2. Component references

- [x] 2.1 Write files for form controls: `button`, `input`, `textarea`, `slider`, `label`, `field`, `select`, `radio-group`, `checkbox`, `switch`.
- [x] 2.2 Write files for layout and content: `layout`, `card`, `separator`, `badge`, `alert`, `empty`, `spinner`, `toast`, `table`, `resizable`.
- [x] 2.3 Write files for navigation and overlays: `tabs`, `pagination`, `navigation-menu`, `breadcrumb`, `accordion`, `collapsible`, `dialog`, `alert-dialog`, `sheet`, `popover`, `tooltip`, `dropdown-menu`, `context-menu`.
- [x] 2.4 Write files for rich content: `code-block`, `markdown`, `image`, `file-icon`, `mermaid`, `diff`, `tree`, moving the matching bullets from `authoring.md` into `Props` comments and linking `annotationTarget` props to the annotation section.
- [x] 2.5 Write `components/index.md` with one row per file.

## 3. Skill entry points

- [x] 3.1 Replace the component table and per-component bullets in `authoring.md` `Components` with a link to `components/index.md`, keeping the general rules and the local file link rule; fix in-file anchors that pointed at removed text.
- [x] 3.2 Update the `SKILL.md` line describing `authoring.md` so agents can find the component references.

## 4. Verification

- [x] 4.1 Run `npm test`, `npm run lint` and `npm run format:check`.
- [x] 4.2 Check `npm pack --dry-run` includes `skills/paneon-visualize/references/components/`.
