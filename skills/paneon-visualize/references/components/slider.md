# Slider

## Use when

Let the human choose a number, or a range between two numbers, by dragging along a track.

## Import

```ts
import { Slider } from '@qoggy/paneon/ui';
```

## Props

```ts
// Slider is Base UI Slider.Root with its control, track, range indicator and thumbs already rendered.
interface SliderProps<Value extends number | readonly number[]> {
  value?: Value; // a number renders one thumb; an array renders one thumb per value
  defaultValue?: Value; // the thumb count comes from value, else defaultValue, else one thumb at min
  onValueChange?: (value: Value extends number ? number : Value, eventDetails: object) => void; // fires while dragging
  onValueCommitted?: (value: Value extends number ? number : Value, eventDetails: object) => void; // fires once when the change ends
  min?: number; // default 0
  max?: number; // default 100
  step?: number; // default 1
  largeStep?: number; // default 10; Page Up/Page Down and Shift+Arrow
  minStepsBetweenValues?: number; // default 0; range sliders only
  orientation?: 'horizontal' | 'vertical'; // default 'horizontal'
  disabled?: boolean;
  name?: string;
  'aria-label'?: string; // names a single thumb
  getAriaLabel?: (index: number) => string; // range thumbs need distinct names, e.g. (index) => index === 0 ? 'Lower bound' : 'Upper bound'
  className?: string; // horizontal fills the width; vertical fills the height with min-h-40
}
// Other Base UI Slider.Root props are accepted.
```
