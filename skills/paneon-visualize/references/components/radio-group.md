# RadioGroup

## Use when

Let the human pick exactly one option from a short list that stays visible.

## Import

```ts
import { RadioGroup, RadioGroupItem } from '@qoggy/paneon/ui';
```

## Props

```ts
// RadioGroup is Base UI RadioGroup with string values; it renders a <div> laid out as grid gap-3.
interface RadioGroupProps {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string, eventDetails: object) => void;
  disabled?: boolean;
  readOnly?: boolean;
  required?: boolean;
  name?: string;
  className?: string;
}
// Other Base UI RadioGroup props are accepted.

// RadioGroupItem is Base UI Radio.Root; it renders only the radio circle, so add a label next to it.
interface RadioGroupItemProps {
  value: string; // required; the value the group reports when this item is selected
  disabled?: boolean;
  id?: string; // id of the hidden input; pair with <Label htmlFor> or <FieldLabel htmlFor>
  className?: string;
}
// Other Base UI Radio.Root props are accepted.
```
