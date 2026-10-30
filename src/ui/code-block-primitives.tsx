// shadcn/ui Base Code Block, MIT. Source and adaptations: upstream.json.
import type { ComponentProps } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from './utils';

const codeBlockVariants = cva(
  'cn-code-block group/code-block relative flex w-full min-w-0 flex-col overflow-hidden',
  {
    variants: {
      variant: {
        default: 'cn-code-block-variant-default',
        destructive: 'cn-code-block-variant-destructive',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export function CodeBlockRoot({
  className,
  variant = 'default',
  size = 'default',
  ...props
}: ComponentProps<'div'> & VariantProps<typeof codeBlockVariants> & { size?: 'default' | 'sm' }) {
  return (
    <div
      data-slot="code-block"
      data-variant={variant}
      data-size={size}
      className={cn(codeBlockVariants({ variant }), className)}
      {...props}
    />
  );
}

export function CodeBlockHeader({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="code-block-header"
      className={cn(
        'cn-code-block-header flex min-w-0 shrink-0 items-center *:has-[>[data-slot=code-block-title]]:min-w-0',
        className,
      )}
      {...props}
    />
  );
}

export function CodeBlockTitle({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="code-block-title"
      className={cn(
        'cn-code-block-title flex min-w-0 items-center truncate [&_svg]:pointer-events-none [&_svg]:shrink-0',
        className,
      )}
      {...props}
    />
  );
}

export function CodeBlockActions({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="code-block-actions"
      className={cn(
        'cn-code-block-actions ms-auto flex shrink-0 items-center [[data-slot=code-block]>&]:absolute [[data-slot=code-block]>&]:z-10 [[data-slot=code-block]>&]:opacity-0 [[data-slot=code-block]>&]:transition-opacity [[data-slot=code-block]>&]:group-focus-within/code-block:opacity-100 [[data-slot=code-block]>&]:group-hover/code-block:opacity-100 [[data-slot=code-block]>&]:pointer-coarse:opacity-100',
        className,
      )}
      {...props}
    />
  );
}

export function CodeBlockContent({
  className,
  children,
  style,
  wrap = false,
  lineNumbers = false,
  startLine = 1,
  codeProps,
  ...props
}: ComponentProps<'pre'> & {
  wrap?: boolean;
  lineNumbers?: boolean;
  startLine?: number;
  codeProps?: ComponentProps<'code'>;
}) {
  return (
    <pre
      data-slot="code-block-content"
      data-wrap={wrap || undefined}
      data-numbered={lineNumbers || undefined}
      dir="ltr"
      tabIndex={0}
      style={{ counterReset: `line ${startLine - 1}`, ...style }}
      className={cn(
        'cn-code-block-content min-h-0 min-w-0 overflow-auto text-start font-mono outline-none data-wrap:wrap-break-word data-wrap:whitespace-pre-wrap',
        className,
      )}
      {...props}
    >
      <code
        {...codeProps}
        data-slot="code-block-code"
        className={cn(
          'cn-code-block-code grid min-h-lh min-w-max content-start in-data-numbered:grid-cols-[auto_1fr] in-data-wrap:min-w-0',
          codeProps?.className,
        )}
      >
        {/* Callers own exact line endings. Never trim or synthesize source text. */}
        {lineNumbers ? children : <span className="min-w-0">{children}</span>}
      </code>
    </pre>
  );
}

const codeBlockLineVariants = cva(
  "cn-code-block-line relative block min-h-lh after:absolute after:top-0 after:select-none in-data-numbered:col-span-2 in-data-numbered:grid in-data-numbered:grid-cols-subgrid in-data-numbered:[counter-increment:line] in-data-numbered:before:content-[counter(line)] in-data-numbered:before:select-none in-data-numbered:supports-[content:counter(line)_/_'']:before:content-[counter(line)_/_'']",
  {
    variants: {
      variant: {
        default: 'cn-code-block-line-variant-default',
        added: 'cn-code-block-line-variant-added',
        removed: 'cn-code-block-line-variant-removed',
        highlighted: 'cn-code-block-line-variant-highlighted',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export function CodeBlockLine({
  className,
  variant = 'default',
  children,
  ...props
}: ComponentProps<'span'> & VariantProps<typeof codeBlockLineVariants>) {
  return (
    <span
      data-slot="code-block-line"
      data-variant={variant}
      className={cn(codeBlockLineVariants({ variant }), className)}
      {...props}
    >
      <span data-slot="code-block-line-content" className="min-w-0">
        {children}
      </span>
    </span>
  );
}
