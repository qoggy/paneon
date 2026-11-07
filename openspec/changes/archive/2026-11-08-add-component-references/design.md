## Context

`@qoggy/paneon/ui` exports about 50 source modules from `src/ui/index.ts`. Agents learn them from the `Components` section of `skills/paneon-visualize/references/authoring.md`: a purpose table plus bullets for `Page`, `Select`, `Slider`, `CodeBlock`, `Markdown`, `Image`, `Mermaid` and `DiffView`. Compound parts (for example `SelectTrigger`, `DialogContent`) and props of most components are undocumented. `src/ui/README.md` is developer-facing and not in the package `files` list, so installed agents cannot read it.

Many components are thin wrappers over Base UI with intersected types, such as `src/ui/slider.tsx:13`. Generating props from types would print either opaque type names or every inherited HTML and ARIA prop, so the user chose hand-written references.

## Goals / Non-Goals

**Goals:**

- An agent can find the right component from one small index, then read one short file for its imports and common props.
- Documented import names cannot drift from the real exports without failing `npm test`.
- `authoring.md` stops growing per component.

**Non-Goals:**

- Generating docs from source, or any CLI command for reading them.
- `Example` and `Pitfalls` sections, and type-checking examples. These come in a later version.
- Documenting every inherited Base UI or HTML prop.
- Changing any component or the public API.

## Decisions

### One file per source module

A file covers one module of `src/ui/` with all its parts, for example `card.md` covers `Card`, `CardHeader`, `CardContent` and the rest. File names follow the module (`code-block.md`, `alert-dialog.md`). `layout.tsx` becomes `layout.md` for `Page`, `Section`, `Stack` and `StatusBadge`; `toast.tsx` and `toast-manager.ts` share `toast.md`.

Alternative: one file per exported name. Rejected because compound parts are used together and would mostly duplicate each other.

### Fixed three-section format

````md
# Select

## Use when

Pick one value from a list too long for radio buttons.

## Import

```ts
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@qoggy/paneon/ui';
```

## Props

```ts
// Select (other Base UI Select.Root props are accepted)
interface SelectProps<Value> {
  items: { value: Value; label: string }[]; // needed to show labels for values
  value?: Value;
  defaultValue?: Value;
  onValueChange?: (value: Value) => void;
}
```
````

- `Use when` is one sentence on one line, stating the need the component fits. It is a fact about the product, so it belongs in references rather than in `presenting.md`.
- `Import` is one `import` statement with the names an agent uses. Helpers such as `buttonVariants` are listed when exported.
- `Props` is a TypeScript excerpt of commonly used props per exported component, written by hand from the source. A comment names the upstream type when other props are passed through. Constraints an agent would otherwise get wrong (required props, defaults, units) go in short trailing comments. The existing `authoring.md` bullets for `Page`, `Select`, `Slider`, `CodeBlock`, `Markdown`, `Image`, `Mermaid` and `DiffView` move here.

### Index and links

`components/index.md` is a table with one row per file: the link, the main component names and the same `Use when` sentence. `authoring.md` keeps the opening paragraph of `Components` (prefer existing components, upstream shadcn styling, compound-part naming) and points to the index. Rules that are not about one component, such as local file links in Markdown, stay in `authoring.md`.

Annotation APIs (`AnnotationText`, `usePageAnnotations`, `useAnnotations`, `annotationTarget` props) stay in the annotation section of `authoring.md`. Component files mention the `annotationTarget` prop and link to that section rather than repeat it. `useUI` stays in "Theme and language".

### Consistency test

`tests/component-references.test.ts` uses the TypeScript checker on `src/ui/index.ts` to list exports. The built `dist/ui/index.js` cannot be imported in plain Node because of a JSON import in `file-icon-model.js`, and a checker also sees type exports. The test asserts:

1. Every name in an `Import` block is exported by `src/ui/index.ts`.
2. Every exported value is listed in some `Import` block, or is in an explicit allowlist in the test with a reason. The allowlist covers names documented in `authoring.md` (annotation APIs, `useUI`) and names not meant for panel code (for example `UIProvider`, which the host renders).
3. Every component file has exactly the headings `Use when`, `Import`, `Props` in order, and `Use when` is one non-empty line.
4. `index.md` links every component file once and no missing file, and its sentence for each file matches that file's `Use when`.

Props are not checked; that is the gap the later example type-check closes.

## Risks / Trade-offs

- [Hand-written props drift from the source] → The test catches renamed or removed exports only. Reviewers update the matching file when changing a component's props, and the later example type-check covers the rest.
- [Moving bullets out of `authoring.md` means an agent reads two files] → The index is small, and `authoring.md` links to it from the same place the table used to be.
- [The allowlist hides an export that should be documented] → Each allowlist entry carries a reason in the test, so additions are visible in review.
