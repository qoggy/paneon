# NavigationMenu

## Use when

Show a horizontal set of site-style navigation links, where some items open a panel of sub-links.

## Import

```ts
import {
  NavigationMenu,
  NavigationMenuList,
  NavigationMenuItem,
  NavigationMenuTrigger,
  NavigationMenuContent,
  NavigationMenuLink,
  NavigationMenuIndicator,
  NavigationMenuPositioner,
  navigationMenuTriggerStyle,
} from '@qoggy/paneon/ui';
```

## Props

```ts
// NavigationMenu is Base UI NavigationMenu.Root; its other props are accepted.
// It already renders NavigationMenuPositioner, which shows the open item's content in a popup.
interface NavigationMenuProps<Value> {
  value?: Value | null; // the open item; null when none is open
  defaultValue?: Value | null; // default null
  onValueChange?: (value: Value | null) => void;
  orientation?: 'horizontal' | 'vertical'; // default 'horizontal'
  align?: 'start' | 'center' | 'end'; // default 'start': popup alignment against the trigger
  className?: string;
}

// Structure: NavigationMenu > NavigationMenuList > NavigationMenuItem >
//   NavigationMenuTrigger + NavigationMenuContent, or a NavigationMenuLink alone.
interface NavigationMenuItemProps<Value> {
  value?: Value; // identifies the item for value/onValueChange
}

interface NavigationMenuTriggerProps {
  children: React.ReactNode; // a chevron icon is appended
  className?: string;
}

interface NavigationMenuContentProps {
  className?: string; // set the popup content width here, such as w-96
}

interface NavigationMenuLinkProps extends React.ComponentProps<'a'> {
  href?: string;
  active?: boolean; // marks the link for the current page
  closeOnClick?: boolean; // default false
  render?: React.ReactElement; // Base UI composition: replace the <a> with another element
  className?: string;
}

// navigationMenuTriggerStyle() returns the trigger class string; apply it to a top-level
// NavigationMenuLink so it looks like a trigger.
// NavigationMenuIndicator wraps Base UI NavigationMenu.Icon with a small arrow.
```
