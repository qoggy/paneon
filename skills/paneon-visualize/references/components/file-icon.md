# FileIcon

## Use when

Show a file type icon selected from a file name or path.

## Import

```ts
import { FileIcon, type FileIconProps } from '@qoggy/paneon/ui';
```

## Props

```ts
interface FileIconProps {
  path: string; // required: file name or path, used only to choose the icon; the file is not read
  className?: string; // default size is size-4
}
```
