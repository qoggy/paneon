# AlertDialog

## Use when

Ask the human to confirm or cancel an action before it happens.

## Import

```ts
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogMedia,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogOverlay,
  AlertDialogPortal,
} from '@qoggy/paneon/ui';
```

## Props

```ts
// AlertDialog is Base UI AlertDialog.Root; its other props are accepted.
// It is always modal and clicking outside does not close it.
interface AlertDialogProps {
  open?: boolean;
  defaultOpen?: boolean; // default false
  onOpenChange?: (open: boolean) => void;
}

interface AlertDialogTriggerProps {
  render?: React.ReactElement; // Base UI composition instead of asChild, such as render={<Button variant="destructive">Delete</Button>}
  children?: React.ReactNode; // renders a <button> by default
}

interface AlertDialogContentProps {
  size?: 'default' | 'sm'; // default 'default'; 'sm' is narrow, centered, with two equal footer buttons
  className?: string;
  children: React.ReactNode;
}

// AlertDialogAction and AlertDialogCancel are Buttons that also close the dialog.
interface AlertDialogActionProps {
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link'; // default 'default'
  size?: 'default' | 'xs' | 'sm' | 'lg' | 'icon' | 'icon-xs' | 'icon-sm' | 'icon-lg'; // default 'default'
  onClick?: React.MouseEventHandler<HTMLButtonElement>; // run the confirmed action here
  children: React.ReactNode;
}

interface AlertDialogCancelProps {
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link'; // default 'outline'
  size?: 'default' | 'xs' | 'sm' | 'lg' | 'icon' | 'icon-xs' | 'icon-sm' | 'icon-lg'; // default 'default'
  children: React.ReactNode;
}

// AlertDialogMedia is a <div> for an icon shown beside the title, placed inside AlertDialogHeader.
// AlertDialogContent already renders AlertDialogPortal and AlertDialogOverlay.
// Structure: AlertDialog > AlertDialogTrigger + AlertDialogContent > AlertDialogHeader
// (AlertDialogTitle, AlertDialogDescription), AlertDialogFooter (AlertDialogCancel, AlertDialogAction).
```
