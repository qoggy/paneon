# Checkbox

## Use when

Let the human tick an option on or off, alone or as one of several independent choices.

## Import

```ts
import { Checkbox } from '@qoggy/paneon/ui';
```

## Props

```ts
// Checkbox is Base UI Checkbox.Root; it renders a <span> and a hidden <input>.
interface CheckboxProps {
  checked?: boolean;
  defaultChecked?: boolean; // default false
  onCheckedChange?: (checked: boolean, eventDetails: object) => void;
  indeterminate?: boolean; // default false; mixed state
  disabled?: boolean;
  readOnly?: boolean;
  required?: boolean;
  name?: string;
  value?: string; // submitted when checked; native 'on' when omitted
  id?: string; // id of the hidden input; pair with <Label htmlFor> or <FieldLabel htmlFor>
  'aria-invalid'?: boolean; // true shows the error border
  className?: string;
}
// Other Base UI Checkbox.Root props are accepted.
```
