# Field

## Use when

Lay out a form control with its label, description and error message, or group several such fields.

## Import

```ts
import {
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldContent,
  FieldTitle,
} from '@qoggy/paneon/ui';
```

## Props

```ts
// Field renders a <div role="group"> that holds one control with its FieldLabel, FieldDescription and FieldError.
// It is layout only: link FieldLabel to the control with htmlFor and id.
interface FieldProps {
  orientation?: 'vertical' | 'horizontal' | 'responsive'; // default 'vertical'; 'horizontal' puts the label beside the control; 'responsive' switches to horizontal when the enclosing FieldGroup is md wide or more
  'data-invalid'?: boolean; // true colors the field text as an error
  'data-disabled'?: boolean; // true dims FieldLabel and FieldTitle
  className?: string;
}
// Other <div> props are accepted.

// FieldLabel is Label (a <label>).
interface FieldLabelProps {
  htmlFor?: string; // the id of the control
  className?: string;
}
// When a FieldLabel wraps a whole Field, it renders as a bordered card that highlights while its Checkbox, Switch or RadioGroupItem is checked.

// FieldDescription renders a <p> of muted helper text.
// FieldTitle renders a <div> styled like a label, for a heading that is not a <label>.
// FieldContent renders a <div> that stacks a FieldLabel or FieldTitle with its FieldDescription, beside a control in a horizontal Field.

// FieldError renders a <div role="alert"> in the error color, and nothing when it has no content.
interface FieldErrorProps {
  children?: React.ReactNode; // shown as is; takes precedence over errors
  errors?: Array<{ message?: string } | undefined>; // duplicate messages are merged; one message renders as text, several as a list
  className?: string;
}

// FieldSet renders a <fieldset> for related fields; FieldLegend renders its <legend>.
interface FieldLegendProps {
  variant?: 'legend' | 'label'; // default 'legend' (text-base); 'label' uses text-sm
}
// FieldGroup renders a <div> that stacks Fields with gap-7.
// FieldSeparator renders a horizontal line between fields; children, if any, show as text centered on the line.
// Other props of the rendered HTML element are accepted by each part.
```
