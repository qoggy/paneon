# toast

## Use when

Show a short notification that appears in a page corner and disappears by itself.

## Import

```ts
import { toast, useToastManager } from '@qoggy/paneon/ui';
```

## Props

```ts
// The host already renders the toaster: call toast.add(...) and render nothing.
// toast is a Base UI toast manager; useToastManager() returns the same API inside components,
// plus toasts, the list of open toasts.
interface ToastAddOptions {
  title?: React.ReactNode;
  description?: React.ReactNode;
  type?: 'success' | 'info' | 'warning' | 'error' | 'loading'; // these render an icon; other strings render none
  timeout?: number; // ms before it closes, default 5000; 0 keeps it open
  priority?: 'low' | 'high'; // default 'low': announced politely; 'high' announces urgently
  actionProps?: React.ComponentProps<'button'>; // renders an action button, e.g. { children: 'Undo', onClick }
  id?: string; // adding an existing id updates that toast in place
  onClose?: () => void;
}

interface ToastManager {
  add(options: ToastAddOptions): string; // returns the toast id
  update(id: string, options: Partial<ToastAddOptions>): void;
  close(id?: string): void; // no id closes every toast
  promise<Value>(
    promise: Promise<Value>,
    options: {
      loading: string | ToastAddOptions;
      success: string | ToastAddOptions | ((result: Value) => string | ToastAddOptions);
      error: string | ToastAddOptions | ((error: unknown) => string | ToastAddOptions);
    },
  ): Promise<Value>;
}
```
