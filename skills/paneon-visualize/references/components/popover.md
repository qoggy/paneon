# Popover

## Use when

Show a small floating panel anchored to a trigger, for extra details or a short form.

## Import

```ts
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverDescription,
  PopoverClose,
} from '@qoggy/paneon/ui';
```

## Props

```ts
// Popover is Base UI Popover.Root; its other props are accepted.
interface PopoverProps {
  open?: boolean;
  defaultOpen?: boolean; // default false
  onOpenChange?: (open: boolean) => void;
  modal?: boolean | 'trap-focus'; // default false
}

interface PopoverTriggerProps {
  render?: React.ReactElement; // Base UI composition instead of asChild, such as render={<Button variant="outline" />}
  openOnHover?: boolean; // default false
  delay?: number; // hover open delay in ms; default 300
  children?: React.ReactNode; // renders a <button> by default
}

interface PopoverContentProps {
  side?: 'top' | 'bottom' | 'left' | 'right' | 'inline-start' | 'inline-end'; // default 'bottom'
  align?: 'start' | 'center' | 'end'; // default 'center'
  sideOffset?: number; // default 4
  alignOffset?: number; // default 0
  className?: string; // width is w-72
  children: React.ReactNode;
}

// PopoverHeader is a <div> for PopoverTitle and PopoverDescription.
// PopoverClose is a button that closes the popover; it takes render like PopoverTrigger.
```
