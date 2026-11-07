# Image

## Use when

Show a local or remote image, such as a chart or screenshot produced during analysis.

## Import

```ts
import { Image, type ImageProps } from '@qoggy/paneon/ui';
```

## Props

```ts
// <Image src="./picture.png" alt="Analysis result" className="max-w-md" />
// Markdown images use the same component.
interface ImageProps<TRef> {
  src: string; // required; local relative paths resolve against --cwd, or sourcePath's directory; absolute paths work directly
  alt: string; // required
  sourcePath?: string; // file the image path is relative to
  className?: string;
  annotationTarget?: TRef; // opt into page annotations; see authoring.md#image-and-mermaid
}
```
