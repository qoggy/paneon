# Dialog

## Use when

Open a modal window over the page for a focused task or details that need the human's attention.

## Import

```ts
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogClose,
  DialogOverlay,
  DialogPortal,
} from '@qoggy/paneon/ui';
```

## Props

```ts
// Dialog is Base UI Dialog.Root; its other props are accepted.
interface DialogProps {
  open?: boolean;
  defaultOpen?: boolean; // default false
  onOpenChange?: (open: boolean) => void;
  modal?: boolean | 'trap-focus'; // default true
  disablePointerDismissal?: boolean; // default false: clicking outside closes the dialog
}

interface DialogTriggerProps {
  render?: React.ReactElement; // Base UI composition instead of asChild, such as render={<Button>Open</Button>}
  children?: React.ReactNode; // renders a <button> by default
}

interface DialogContentProps {
  showCloseButton?: boolean; // default true: X button in the top-right corner
  className?: string; // width is max-w-lg from the sm breakpoint; override such as sm:max-w-2xl
  children: React.ReactNode;
}

interface DialogFooterProps extends React.ComponentProps<'div'> {
  showCloseButton?: boolean; // default false: appends an outline "Close" button
}

interface DialogCloseProps {
  render?: React.ReactElement; // such as render={<Button variant="outline">Cancel</Button>}
}

// DialogContent already renders DialogPortal and DialogOverlay.
// Structure: Dialog > DialogTrigger + DialogContent > DialogHeader (DialogTitle, DialogDescription),
// body, DialogFooter.
// Annotations on content in a closed Dialog need an adapter; see authoring.md#adapters.
```
