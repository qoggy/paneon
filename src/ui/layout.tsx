import type { HTMLAttributes } from 'react';
import type { JsonValue } from '../sdk/annotation';
import { cn } from './utils';
import { Badge } from './badge';
import { AnnotationText } from './annotation';

type LayoutProps = HTMLAttributes<HTMLElement> & { title?: string; description?: string };
export type PageProps<TRef = JsonValue> = LayoutProps & {
  annotationTarget?: TRef;
};
export function Page<TRef = JsonValue>({
  title,
  description,
  annotationTarget,
  className,
  children,
  ...props
}: PageProps<TRef>) {
  return (
    <main className={cn('mx-auto w-full max-w-6xl space-y-8 p-4 md:p-8', className)} {...props}>
      {(title || description) && (
        <header className="space-y-2">
          {title && (
            <h1 className="text-2xl font-semibold tracking-tight">
              {annotationTarget === undefined ? (
                title
              ) : (
                <AnnotationText target={{ id: annotationTarget, field: 'title' }}>
                  {title}
                </AnnotationText>
              )}
            </h1>
          )}
          {description && (
            <p className="text-muted-foreground">
              {annotationTarget === undefined ? (
                description
              ) : (
                <AnnotationText target={{ id: annotationTarget, field: 'description' }}>
                  {description}
                </AnnotationText>
              )}
            </p>
          )}
        </header>
      )}
      {children}
    </main>
  );
}
export type SectionProps<TRef = JsonValue> = LayoutProps & {
  annotationTarget?: TRef;
};
export function Section<TRef = JsonValue>({
  title,
  description,
  annotationTarget,
  className,
  children,
  ...props
}: SectionProps<TRef>) {
  return (
    <section className={cn('min-w-0 space-y-4', className)} {...props}>
      {(title || description) && (
        <header className="space-y-1">
          {title && (
            <h2 className="text-lg font-semibold">
              {annotationTarget === undefined ? (
                title
              ) : (
                <AnnotationText target={{ id: annotationTarget, field: 'title' }}>
                  {title}
                </AnnotationText>
              )}
            </h2>
          )}
          {description && (
            <p className="text-sm text-muted-foreground">
              {annotationTarget === undefined ? (
                description
              ) : (
                <AnnotationText target={{ id: annotationTarget, field: 'description' }}>
                  {description}
                </AnnotationText>
              )}
            </p>
          )}
        </header>
      )}
      {children}
    </section>
  );
}
const gaps = { 2: 'gap-2', 3: 'gap-3', 4: 'gap-4', 6: 'gap-6', 8: 'gap-8' };
export function Stack({
  direction = 'column',
  gap = 4,
  wrap = false,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  direction?: 'row' | 'column';
  gap?: keyof typeof gaps;
  wrap?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex min-w-0',
        direction === 'row' ? 'flex-row' : 'flex-col',
        gaps[gap],
        wrap && 'flex-wrap',
        className,
      )}
      {...props}
    />
  );
}
export const StatusBadge = Badge;
