# Empty

## Use when

Show an empty state when a list, table or view has no data yet.

## Import

```ts
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from '@qoggy/paneon/ui';
```

## Props

```ts
// Every Empty part renders a <div> and accepts all <div> props.
// Structure: Empty > EmptyHeader (EmptyMedia, EmptyTitle, EmptyDescription) + EmptyContent.
interface EmptyMediaProps {
  variant?: 'default' | 'icon'; // default 'default'; 'icon' puts the icon on a small muted square
  className?: string;
}

// EmptyContent holds actions such as buttons below the header.
```
