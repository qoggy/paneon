# Label

## Use when

Name a form control with visible text outside a `Field`.

## Import

```ts
import { Label } from '@qoggy/paneon/ui';
```

## Props

```ts
// Label renders a <label>.
interface LabelProps {
  htmlFor?: string; // the id of the labelled control; or wrap the control inside the Label
  children: React.ReactNode;
  className?: string;
}
// Other <label> props are accepted.
```
