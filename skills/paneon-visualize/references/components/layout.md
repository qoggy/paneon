# Page

## Use when

Give a panel its page frame with a title and description, group content into titled sections, and space blocks in rows or columns.

## Import

```ts
import {
  Page,
  Section,
  Stack,
  StatusBadge,
  type PageProps,
  type SectionProps,
} from '@qoggy/paneon/ui';
```

## Props

```ts
// Page renders <main>; other HTML element props are accepted.
interface PageProps<TRef> {
  title?: string; // <h1>
  description?: string;
  annotationTarget?: TRef; // annotate the title and description; see authoring.md#annotation-components
  className?: string; // default mx-auto max-w-6xl p-4 md:p-8: content is centered, at most 1152px wide
  // Full width for multi-column workbenches, side-by-side diffs, wide tables or large diagrams:
  //   <Page className="max-w-none md:p-4">
  // Narrow a form with className="max-w-160".
}

// Section renders <section>; other HTML element props are accepted.
interface SectionProps<TRef> {
  title?: string; // <h2>
  description?: string;
  annotationTarget?: TRef; // annotate the title and description; see authoring.md#annotation-components
  className?: string;
}

// Stack renders a flex <div> for row or column spacing; other <div> props are accepted.
interface StackProps {
  direction?: 'row' | 'column'; // default 'column'
  gap?: 2 | 3 | 4 | 6 | 8; // default 4 (Tailwind gap scale)
  wrap?: boolean; // default false
  className?: string;
}

// StatusBadge is a short status label; it is the same component as Badge (see badge.md).
```
