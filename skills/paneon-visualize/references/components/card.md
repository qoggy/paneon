# Card

## Use when

Group related content in a bordered box with an optional header, actions and footer.

## Import

```ts
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
  CardContent,
  CardFooter,
} from '@qoggy/paneon/ui';
```

## Props

```ts
// Every Card part renders a <div> and accepts all <div> props; none has its own props.
interface CardProps {
  className?: string;
  children?: React.ReactNode;
}

// Structure: Card > CardHeader (CardTitle, CardDescription, CardAction) + CardContent + CardFooter.
// CardAction sits at the top right of CardHeader.
```
