import { useState, type MouseEventHandler, type ReactNode } from 'react';
import { Ellipsis, Expand } from 'lucide-react';
import { Button } from './button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from './dropdown-menu';
import { ViewerIconButton } from './image-viewer';
import { Spinner } from './spinner';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip';
import { cn } from './utils';

/** Internal shared controls; content components supply their own menu actions. */
export function MediaToolbar({
  expandLabel,
  moreLabel,
  onExpand,
  busy = false,
  children,
}: {
  expandLabel: string;
  moreLabel: string;
  onExpand: MouseEventHandler<HTMLButtonElement>;
  busy?: boolean;
  children: ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <TooltipProvider>
      <span
        data-slot="media-toolbar"
        className={cn(
          'flex shrink-0 flex-col items-center rounded-md border bg-background p-0.5 text-muted-foreground shadow-xs transition-opacity group-focus-within/media:pointer-events-auto group-focus-within/media:opacity-100 group-hover/media:pointer-events-auto group-hover/media:opacity-100',
          // Keep the trigger focusable so a closing viewer can restore it and reveal the toolbar.
          menuOpen || busy ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0',
        )}
      >
        <ViewerIconButton label={expandLabel} tooltipSide="right" onClick={onExpand}>
          <Expand />
        </ViewerIconButton>
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <Tooltip>
            <TooltipTrigger
              render={
                <DropdownMenuTrigger
                  render={
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label={moreLabel}
                      disabled={busy}
                    >
                      {busy ? <Spinner aria-hidden="true" /> : <Ellipsis />}
                    </Button>
                  }
                />
              }
            />
            <TooltipContent side="right">{moreLabel}</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end">{children}</DropdownMenuContent>
        </DropdownMenu>
      </span>
    </TooltipProvider>
  );
}
