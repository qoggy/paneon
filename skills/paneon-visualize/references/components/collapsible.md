# Collapsible

## Use when

Show or hide one block of secondary content behind a toggle.

## Import

```ts
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@qoggy/paneon/ui';
```

## Props

```ts
// Unstyled Base UI Collapsible parts; their other props are accepted.
interface CollapsibleProps {
  open?: boolean;
  defaultOpen?: boolean; // default false
  onOpenChange?: (open: boolean) => void;
  disabled?: boolean; // default false
  className?: string;
}

interface CollapsibleTriggerProps {
  render?: React.ReactElement; // Base UI composition instead of asChild, such as render={<Button variant="ghost" />}
  className?: string;
  children?: React.ReactNode; // renders a <button> by default
}

interface CollapsibleContentProps {
  keepMounted?: boolean; // default false: closed content is unmounted
  className?: string;
  children: React.ReactNode;
}

// Annotations on content in a closed CollapsibleContent need an adapter; see authoring.md#adapters.
```
