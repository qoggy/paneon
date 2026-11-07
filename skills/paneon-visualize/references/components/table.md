# Table

## Use when

Show a small static table that you build row by row from table parts.

## Import

```ts
import {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableRow,
  TableHead,
  TableCell,
  TableCaption,
} from '@qoggy/paneon/ui';
```

## Props

```ts
// Table is a static table built from parts; each part renders its HTML element and accepts its props:
// Table <table> (wrapped in a horizontally scrolling <div>), TableHeader <thead>, TableBody <tbody>,
// TableFooter <tfoot>, TableRow <tr>, TableHead <th>, TableCell <td>, TableCaption <caption>.
interface TableCellProps {
  colSpan?: number;
  className?: string; // cells default to whitespace-nowrap; add whitespace-normal to wrap text
}

// A TableRow with data-state="selected" gets the selected background.
```
