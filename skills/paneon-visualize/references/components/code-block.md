# CodeBlock

## Use when

Show a read-only code snippet with syntax highlighting, optional line numbers and a highlighted line range.

## Import

```ts
import { CodeBlock, type CodeBlockProps } from '@qoggy/paneon/ui';
```

## Props

```ts
interface CodeBlockProps<TRef> {
  code: string; // the only required prop
  language?: string; // bundled highlighting; omitted or unknown languages render as plain text
  header?: boolean | string; // default true: title bar with the language; a string sets a custom title; false hides the title bar
  lineNumbers?: boolean; // default false; use it when line references help the explanation
  defaultWrap?: boolean; // default true; false starts with horizontal scrolling; the human can toggle it
  highlightedLines?: { start: number; end: number }; // 1-based, both endpoints included
  annotationTarget?: TRef; // opt into page annotations; see authoring.md#markdown-codeblock-and-diffview
  className?: string; // root container
}
```

The wrap tooltip describes the current state and next action. CodeBlock and DiffView use the same wrap-state interaction, with their own defaults: CodeBlock wraps by default and DiffView does not.

For `language="json"` or `language="jsonc"`, multiline objects and arrays start expanded. Use the small triangle beside the line to fold a section, and click the triangle or `…` to reopen it. The toolbar places **Expand all** and **Collapse all** before word wrap and copy. Collapse all keeps the top-level keys of an object visible and collapses a top-level array into one line. Copy always uses the complete source, and locating an annotation opens folds that cover its text.
