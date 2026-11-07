# Select

## Use when

Pick one value from a dropdown list, when the options are too many for a `RadioGroup`.

## Import

```ts
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SelectGroup,
  SelectLabel,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
} from '@qoggy/paneon/ui';
```

## Props

```ts
// Select is Base UI Select.Root; its other props are accepted.
interface SelectProps<Value, Multiple extends boolean | undefined = false> {
  items?: { value: Value; label: React.ReactNode }[] | Record<string, React.ReactNode>; // needed to show the label of the selected value
  value?: (Multiple extends true ? readonly Value[] : Value) | null;
  defaultValue?: (Multiple extends true ? readonly Value[] : Value) | null;
  onValueChange?: (value: Multiple extends true ? Value[] : Value | null) => void;
  multiple?: Multiple;
  disabled?: boolean;
  name?: string;
}

interface SelectTriggerProps {
  size?: 'sm' | 'default'; // default 'default'
  className?: string; // width is w-fit; set a width such as w-48
}

interface SelectValueProps {
  placeholder?: React.ReactNode; // shown while nothing is selected
}

interface SelectContentProps {
  side?: 'top' | 'bottom' | 'left' | 'right'; // default 'bottom'
  align?: 'start' | 'center' | 'end'; // default 'center'
  alignItemWithTrigger?: boolean; // default true: the selected item overlays the trigger
  className?: string;
}

interface SelectItemProps<Value> {
  value: Value;
  disabled?: boolean;
  children: React.ReactNode; // the visible label
}

// SelectGroup wraps items under a SelectLabel; SelectSeparator draws a divider.
// SelectContent already renders SelectScrollUpButton and SelectScrollDownButton.
```
