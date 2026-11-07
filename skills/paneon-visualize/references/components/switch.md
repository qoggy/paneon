# Switch

## Use when

Let the human turn a single setting on or off.

## Import

```ts
import { Switch } from '@qoggy/paneon/ui';
```

## Props

```ts
// Switch is Base UI Switch.Root; it renders a <span> and a hidden <input>.
interface SwitchProps {
  size?: 'sm' | 'default'; // default 'default'
  checked?: boolean;
  defaultChecked?: boolean; // default false
  onCheckedChange?: (checked: boolean, eventDetails: object) => void;
  disabled?: boolean;
  readOnly?: boolean;
  required?: boolean;
  name?: string;
  value?: string; // submitted when on; native 'on' when omitted
  id?: string; // id of the hidden input; pair with <Label htmlFor> or <FieldLabel htmlFor>
  className?: string;
}
// Other Base UI Switch.Root props are accepted.
```
