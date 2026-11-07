# Sheet

## Use when

Slide a panel in from a screen edge to show details or a form while keeping the page in context.

## Import

```ts
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
  SheetClose,
} from '@qoggy/paneon/ui';
```

## Props

```ts
// Sheet is Base UI Dialog.Root; its other props are accepted.
interface SheetProps {
  open?: boolean;
  defaultOpen?: boolean; // default false
  onOpenChange?: (open: boolean) => void;
  modal?: boolean | 'trap-focus'; // default true
}

interface SheetTriggerProps {
  render?: React.ReactElement; // Base UI composition instead of asChild, such as render={<Button>Details</Button>}
  children?: React.ReactNode; // renders a <button> by default
}

interface SheetContentProps {
  side?: 'top' | 'right' | 'bottom' | 'left'; // default 'right'
  showCloseButton?: boolean; // default true: X button in the top-right corner
  className?: string; // left/right sheets are w-3/4 and sm:max-w-sm; override such as sm:max-w-xl
  children: React.ReactNode;
}

interface SheetCloseProps {
  render?: React.ReactElement; // such as render={<Button variant="outline">Done</Button>}
}

// SheetContent renders its own portal and overlay.
// SheetHeader and SheetFooter are padded <div>s; SheetFooter sticks to the bottom.
// Annotations on content in a closed Sheet need an adapter; see authoring.md#adapters.
```
