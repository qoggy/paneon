# ContextMenu

## Use when

Open a menu of actions when the human right-clicks or long-presses an area.

## Import

```ts
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuLabel,
  ContextMenuItem,
  ContextMenuCheckboxItem,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
  ContextMenuPortal,
} from '@qoggy/paneon/ui';
```

## Props

```ts
// ContextMenu is Base UI ContextMenu.Root; its other props are accepted.
interface ContextMenuProps {
  open?: boolean;
  defaultOpen?: boolean; // default false
  onOpenChange?: (open: boolean) => void;
}

interface ContextMenuTriggerProps {
  render?: React.ReactElement; // Base UI composition instead of asChild
  className?: string; // the right-click area; renders a <div> with select-none
  children: React.ReactNode;
}

interface ContextMenuContentProps {
  side?: 'top' | 'bottom' | 'left' | 'right' | 'inline-start' | 'inline-end'; // default 'right'
  align?: 'start' | 'center' | 'end'; // default 'start'
  sideOffset?: number; // default 0
  alignOffset?: number; // default 4
  className?: string;
}

interface ContextMenuItemProps {
  onClick?: React.MouseEventHandler<HTMLElement>;
  variant?: 'default' | 'destructive'; // default 'default'
  inset?: boolean; // adds left padding
  disabled?: boolean;
  closeOnClick?: boolean; // default true
}

interface ContextMenuCheckboxItemProps {
  checked?: boolean;
  defaultChecked?: boolean; // default false
  onCheckedChange?: (checked: boolean) => void;
  inset?: boolean;
  closeOnClick?: boolean; // default false
}

interface ContextMenuRadioGroupProps<Value> {
  value?: Value;
  defaultValue?: Value;
  onValueChange?: (value: Value) => void;
}

interface ContextMenuRadioItemProps<Value> {
  value: Value;
  inset?: boolean;
  closeOnClick?: boolean; // default false
}

interface ContextMenuLabelProps {
  inset?: boolean; // must be inside ContextMenuGroup or ContextMenuRadioGroup
}

// ContextMenuSub > ContextMenuSubTrigger (takes inset) + ContextMenuSubContent opens a submenu to the right.
// ContextMenuShortcut is a right-aligned <span> for a key hint inside an item.
// ContextMenuContent already renders ContextMenuPortal.
```
