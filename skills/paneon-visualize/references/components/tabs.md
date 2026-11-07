# Tabs

## Use when

Switch between several views of related content in the same place, showing one view at a time.

## Import

```ts
import { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants } from '@qoggy/paneon/ui';
```

## Props

```ts
// Tabs is Base UI Tabs.Root; its other props are accepted.
interface TabsProps<Value> {
  value?: Value;
  defaultValue?: Value; // default 0
  onValueChange?: (value: Value) => void;
  orientation?: 'horizontal' | 'vertical'; // default 'horizontal'
  className?: string;
}

interface TabsListProps {
  variant?: 'default' | 'line'; // default 'default': muted pill background; 'line' underlines the active tab
  activateOnFocus?: boolean; // default true: arrow-key focus also selects the tab
  className?: string;
}

interface TabsTriggerProps<Value> {
  value: Value; // matches the TabsContent value
  disabled?: boolean;
  children: React.ReactNode;
}

interface TabsContentProps<Value> {
  value: Value; // matches the TabsTrigger value
  keepMounted?: boolean; // default false: inactive panels are unmounted
  className?: string;
}

// tabsListVariants({ variant }) returns the TabsList class string.
// Annotations on content in an inactive TabsContent need an adapter; see authoring.md#adapters.
```
