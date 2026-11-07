# Tooltip

## Use when

Show a short text hint when the human hovers or focuses an element, such as an icon button.

## Import

```ts
import { Tooltip, TooltipTrigger, TooltipContent } from '@qoggy/paneon/ui';
```

## Props

```ts
// The host already wraps every panel in TooltipProvider (open delay 0); panels do not render it.
// Tooltip is Base UI Tooltip.Root; its other props are accepted.
interface TooltipProps {
  open?: boolean;
  defaultOpen?: boolean; // default false
  onOpenChange?: (open: boolean) => void;
  disabled?: boolean; // default false
}

interface TooltipTriggerProps {
  render?: React.ReactElement; // Base UI composition instead of asChild, such as render={<Button size="icon" />}
  delay?: number; // open delay in ms; overrides the provider's 0
  closeDelay?: number; // ms; default 0
  children?: React.ReactNode; // renders a <button> by default
}

interface TooltipContentProps {
  side?: 'top' | 'bottom' | 'left' | 'right' | 'inline-start' | 'inline-end'; // default 'top'
  align?: 'start' | 'center' | 'end'; // default 'center'
  sideOffset?: number; // default 0
  className?: string;
  children: React.ReactNode; // an arrow is appended
}
```
