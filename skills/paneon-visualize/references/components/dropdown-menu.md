# DropdownMenu

## Use when

Open a list of actions or options from a button.

## Import

```ts
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuPortal,
} from '@qoggy/paneon/ui';
```

## Props

```ts
// DropdownMenu is Base UI Menu.Root; its other props are accepted.
interface DropdownMenuProps {
  open?: boolean;
  defaultOpen?: boolean; // default false
  onOpenChange?: (open: boolean) => void;
  modal?: boolean; // default true
}

interface DropdownMenuTriggerProps {
  render?: React.ReactElement; // Base UI composition instead of asChild, such as render={<Button variant="outline" />}
  openOnHover?: boolean;
  children?: React.ReactNode; // renders a <button> by default
}

interface DropdownMenuContentProps {
  side?: 'top' | 'bottom' | 'left' | 'right' | 'inline-start' | 'inline-end'; // default 'bottom'
  align?: 'start' | 'center' | 'end'; // default 'start'
  sideOffset?: number; // default 4
  alignOffset?: number; // default 0
  className?: string; // min-w-[8rem]
}

interface DropdownMenuItemProps {
  onClick?: React.MouseEventHandler<HTMLElement>;
  variant?: 'default' | 'destructive'; // default 'default'
  inset?: boolean; // adds left padding to line up with checkbox and radio items
  disabled?: boolean;
  closeOnClick?: boolean; // default true
}

interface DropdownMenuCheckboxItemProps {
  checked?: boolean;
  defaultChecked?: boolean; // default false
  onCheckedChange?: (checked: boolean) => void;
  // the menu closes on click
}

interface DropdownMenuRadioGroupProps<Value> {
  value?: Value;
  defaultValue?: Value;
  onValueChange?: (value: Value) => void;
}

interface DropdownMenuRadioItemProps<Value> {
  value: Value; // the menu closes on click
}

interface DropdownMenuLabelProps {
  inset?: boolean; // must be inside DropdownMenuGroup or DropdownMenuRadioGroup
}

// DropdownMenuSub > DropdownMenuSubTrigger (takes inset) + DropdownMenuSubContent opens a submenu;
// DropdownMenuSubContent takes DropdownMenuContentProps with side 'right', alignOffset -4, sideOffset 0.
// DropdownMenuShortcut is a right-aligned <span> for a key hint inside an item.
// DropdownMenuContent already renders DropdownMenuPortal.
```
