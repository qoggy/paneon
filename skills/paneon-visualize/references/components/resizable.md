# ResizablePanelGroup

## Use when

Split an area into panels that the human can resize by dragging the handles between them.

## Import

```ts
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
  type ResizablePanelGroupHandle,
} from '@qoggy/paneon/ui';
```

## Props

```ts
// These wrap react-resizable-panels Group, Panel and Separator; their other props and <div> props are accepted.
// ResizablePanelGroup fills its parent (h-full w-full); give the parent a height.
interface ResizablePanelGroupProps {
  orientation?: 'horizontal' | 'vertical'; // default 'horizontal'
  defaultLayout?: { [panelId: string]: number }; // percentages 0..100 keyed by panel id
  onLayoutChange?: (layout: { [panelId: string]: number }) => void; // called on every pointer move
  onLayoutChanged?: (layout: { [panelId: string]: number }) => void; // called after the drag ends
  groupRef?: React.Ref<ResizablePanelGroupHandle | null>; // getLayout() and setLayout(layout)
  disabled?: boolean;
}

// Sizes: a number is pixels; a string without a unit is a percentage ("30" is 30%);
// strings may also use px, %, em, rem, vh or vw.
interface ResizablePanelProps {
  id?: string; // key in the group layout
  defaultSize?: number | string; // default: space shared evenly
  minSize?: number | string; // default 0%
  maxSize?: number | string; // default "100%"
  collapsible?: boolean; // collapses when resized below minSize
  collapsedSize?: number | string; // default 0%
  onResize?: (size: { asPercentage: number; inPixels: number }) => void;
  className?: string; // applied to an inner <div>
}

// Place a ResizableHandle between two panels; panels and handles must be direct children of the group.
interface ResizableHandleProps {
  withHandle?: boolean; // default false: draws a visible grip on the line
  disabled?: boolean;
  className?: string;
}
```
