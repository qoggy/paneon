# Breadcrumb

## Use when

Show the path from a root to the current location, such as folders or nested sections.

## Import

```ts
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
  BreadcrumbEllipsis,
} from '@qoggy/paneon/ui';
```

## Props

```ts
// Plain HTML parts with no state: Breadcrumb is a <nav>, BreadcrumbList an <ol>,
// BreadcrumbItem an <li>, BreadcrumbPage a <span> for the current location.
// Structure: Breadcrumb > BreadcrumbList > BreadcrumbItem (BreadcrumbLink or BreadcrumbPage),
// with a BreadcrumbSeparator between items.

interface BreadcrumbLinkProps extends React.ComponentProps<'a'> {
  href?: string;
  onClick?: React.MouseEventHandler<HTMLAnchorElement>;
  render?: React.ReactElement; // Base UI useRender: replace the <a>, such as render={<button type="button" />}
  className?: string;
}

interface BreadcrumbSeparatorProps extends React.ComponentProps<'li'> {
  children?: React.ReactNode; // default a chevron icon
}

// BreadcrumbEllipsis is a <span> with a "more" icon for collapsed items.
```
