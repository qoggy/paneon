# Mermaid

## Use when

Draw a diagram, such as a flowchart or sequence diagram, from Mermaid source.

## Import

```ts
import { Mermaid, type MermaidProps } from '@qoggy/paneon/ui';
```

## Props

```ts
// <Mermaid code="flowchart LR; A-->B" />
// Mermaid is bundled; never load it from a CDN.
interface MermaidProps<TRef> {
  code: string; // required: the Mermaid source
  className?: string;
  annotationTarget?: TRef; // opt into page annotations; see authoring.md#image-and-mermaid
}
```
