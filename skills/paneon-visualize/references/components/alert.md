# Alert

## Use when

Call out an important message, such as a warning or an error, inside the page content.

## Import

```ts
import { Alert, AlertTitle, AlertDescription } from '@qoggy/paneon/ui';
```

## Props

```ts
// Alert renders <div role="alert">; other <div> props are accepted.
interface AlertProps {
  variant?: 'default' | 'destructive'; // default 'default'
  className?: string;
  children?: React.ReactNode; // an optional lucide icon first, then AlertTitle and AlertDescription
}

// AlertTitle and AlertDescription render <div> and accept all <div> props.
```
