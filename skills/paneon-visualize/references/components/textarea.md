# Textarea

## Use when

Collect multi-line text typed by the human, such as a comment or a description.

## Import

```ts
import { Textarea } from '@qoggy/paneon/ui';
```

## Props

```ts
// Textarea renders a <textarea>.
interface TextareaProps {
  value?: string;
  defaultValue?: string;
  onChange?: React.ChangeEventHandler<HTMLTextAreaElement>;
  placeholder?: string;
  disabled?: boolean;
  id?: string; // pair with <Label htmlFor> or <FieldLabel htmlFor>
  'aria-invalid'?: boolean; // true shows the error border
  className?: string; // width is w-full; height starts at min-h-16 and grows with the content
}
// Other <textarea> props are accepted.
```
