# Badge

## Use when

Show a short label such as a status, tag or count inline with other content.

## Import

```ts
import { Badge, badgeVariants } from '@qoggy/paneon/ui';
```

## Props

```ts
// Badge renders a <span>; other <span> props are accepted.
interface BadgeProps {
  variant?: 'default' | 'secondary' | 'destructive' | 'outline' | 'ghost' | 'link'; // default 'default'
  render?: React.ReactElement; // Base UI render prop, e.g. render={<a href="..." />} to render a link
  className?: string;
}

// badgeVariants({ variant }) returns the Badge class names for another element.
```
