# Accordion

## Use when

Stack several titled sections that each expand and collapse in place.

## Import

```ts
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@qoggy/paneon/ui';
```

## Props

```ts
// Accordion is Base UI Accordion.Root; its other props are accepted.
interface AccordionProps<Value> {
  value?: Value[]; // values of the open items; always an array
  defaultValue?: Value[];
  onValueChange?: (value: Value[]) => void;
  multiple?: boolean; // default false: opening one item closes the others
  disabled?: boolean;
  keepMounted?: boolean; // default false: closed panels are unmounted
}

interface AccordionItemProps<Value> {
  value?: Value; // generated when omitted; set it when using value/defaultValue
  disabled?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}

interface AccordionTriggerProps {
  children: React.ReactNode; // the section title; a chevron icon is appended
  className?: string;
}

interface AccordionContentProps {
  keepMounted?: boolean; // default false
  className?: string; // applied to the inner padding wrapper
  children: React.ReactNode;
}

// Structure: Accordion > AccordionItem > AccordionTrigger + AccordionContent.
// Annotations on content in a closed AccordionContent need an adapter; see authoring.md#adapters.
```
