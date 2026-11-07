# Separator

## Use when

Draw a thin horizontal or vertical divider line between pieces of content.

## Import

```ts
import { Separator } from '@qoggy/paneon/ui';
```

## Props

```ts
// Separator is Base UI Separator; it renders a <div> and other <div> props are accepted.
interface SeparatorProps {
  orientation?: 'horizontal' | 'vertical'; // default 'horizontal'; vertical fills the parent height
  className?: string;
}
```
