# Button

## Use when

Let the human trigger an action with a click, such as submitting, confirming or opening something.

## Import

```ts
import { Button, buttonVariants } from '@qoggy/paneon/ui';
```

## Props

```ts
// Button is Base UI Button, which renders a <button>.
interface ButtonProps {
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link'; // default 'default'
  size?: 'default' | 'xs' | 'sm' | 'lg' | 'icon' | 'icon-xs' | 'icon-sm' | 'icon-lg'; // default 'default'; icon sizes are square, for an icon-only child
  type?: 'button' | 'submit' | 'reset'; // default 'button'; set 'submit' to submit a <form>
  disabled?: boolean;
  focusableWhenDisabled?: boolean; // default false
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  render?: React.ReactElement; // render another element, e.g. <a href="...">; also set nativeButton={false} when it is not a <button>
  nativeButton?: boolean; // default true
  className?: string;
}
// Other Base UI Button and <button> props are accepted.

// buttonVariants({ variant, size, className }) returns the Button class string, for styling another element as a button.
```
