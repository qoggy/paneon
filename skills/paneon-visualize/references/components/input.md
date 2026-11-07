# Input

## Use when

Collect a single line of text, a number or another value typed by the human.

## Import

```ts
import { Input } from '@qoggy/paneon/ui';
```

## Props

```ts
// Input renders Base UI Input, an <input>.
interface InputProps {
  type?: React.HTMLInputTypeAttribute; // default 'text'
  value?: string | number;
  defaultValue?: string | number;
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
  placeholder?: string;
  disabled?: boolean;
  id?: string; // pair with <Label htmlFor> or <FieldLabel htmlFor>
  'aria-invalid'?: boolean; // true shows the error border
  className?: string; // width is w-full
}
// Other <input> props are accepted.
```
