import { Slider as SliderPrimitive } from '@base-ui/react/slider';
import { cn } from './utils';

function Slider<Value extends number | readonly number[]>({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  getAriaLabel,
  'aria-label': ariaLabel,
  ...props
}: SliderPrimitive.Root.Props<Value> &
  Pick<SliderPrimitive.Thumb.Props, 'getAriaLabel'> & { className?: string }) {
  const currentValues: number | readonly number[] = value ?? defaultValue ?? min;
  const values = typeof currentValues === 'number' ? [currentValues] : currentValues;

  return (
    <SliderPrimitive.Root
      className={cn('data-horizontal:w-full data-vertical:h-full', className)}
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      thumbAlignment="edge"
      {...props}
    >
      <SliderPrimitive.Control className="relative flex w-full touch-none items-center select-none data-disabled:opacity-50 data-vertical:h-full data-vertical:min-h-40 data-vertical:w-auto data-vertical:flex-col">
        <SliderPrimitive.Track
          data-slot="slider-track"
          className="relative grow overflow-hidden rounded-full bg-muted select-none data-horizontal:h-1 data-horizontal:w-full data-vertical:h-full data-vertical:w-1"
        >
          <SliderPrimitive.Indicator
            data-slot="slider-range"
            className="bg-primary select-none data-horizontal:h-full data-vertical:w-full"
          />
        </SliderPrimitive.Track>
        {values.map((_, index) => (
          <SliderPrimitive.Thumb
            data-slot="slider-thumb"
            key={index}
            getAriaLabel={getAriaLabel}
            aria-label={ariaLabel}
            className="relative block size-3 shrink-0 rounded-full border border-ring bg-white ring-ring/50 transition-[color,box-shadow] select-none after:absolute after:-inset-2 hover:ring-3 focus-visible:outline-hidden active:ring-3 disabled:pointer-events-none disabled:opacity-50 has-focus-visible:ring-3"
          />
        ))}
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  );
}

export { Slider };
