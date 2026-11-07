# Pagination

## Use when

Show page links with previous and next controls for content split into pages.

## Import

```ts
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationPrevious,
  PaginationNext,
  PaginationEllipsis,
} from '@qoggy/paneon/ui';
```

## Props

```ts
// Plain HTML parts with no page state: Pagination is a <nav>, PaginationContent a <ul>,
// PaginationItem an <li>; the page is tracked by the panel.
// Structure: Pagination > PaginationContent > PaginationItem > PaginationLink.

interface PaginationLinkProps extends React.ComponentProps<'a'> {
  isActive?: boolean; // marks the current page: aria-current="page" and the outline button style
  size?: 'default' | 'xs' | 'sm' | 'lg' | 'icon' | 'icon-xs' | 'icon-sm' | 'icon-lg'; // Button sizes; default 'icon'
  href?: string;
  onClick?: React.MouseEventHandler<HTMLAnchorElement>; // handle page changes here when there is no href
}

// PaginationPrevious and PaginationNext take PaginationLinkProps (size 'default');
// children replace the localized "Previous" / "Next" label, which is hidden below the sm breakpoint.
// PaginationEllipsis is a <span> showing a "more pages" icon.
```
