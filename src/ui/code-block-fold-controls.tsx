import { useRef } from 'react';
import { FoldVertical, UnfoldVertical } from 'lucide-react';
import { Button } from './button';
import type { JsonSection } from './code-block-source';
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip';
import { useUI } from './use-ui';

export function CodeBlockFoldActions({
  canExpand,
  canCollapse,
  expand,
  collapse,
}: {
  canExpand: boolean;
  canCollapse: boolean;
  expand: () => void;
  collapse: () => void;
}) {
  const { t } = useUI();
  const actions = [
    { label: t('Expand all'), Icon: UnfoldVertical, enabled: canExpand, run: expand },
    { label: t('Collapse all'), Icon: FoldVertical, enabled: canCollapse, run: collapse },
  ];
  return actions.map(({ label, Icon, enabled, run }) => (
    <Tooltip key={label}>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={label}
            disabled={!enabled}
            focusableWhenDisabled
            onClick={run}
          >
            <Icon className="size-4" strokeWidth={1.5} aria-hidden="true" />
          </Button>
        }
      />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  ));
}

export function JsonFoldMarker({
  section,
  folded,
  gutter,
  toggle,
}: {
  section: JsonSection;
  folded: boolean;
  gutter: boolean;
  toggle: () => void;
}) {
  const { t } = useUI();
  const trigger = useRef<HTMLButtonElement>(null);
  const position = { line: section.line + 1, column: section.column + 1 };
  const expand = t('Expand JSON at line {line}, column {column}', position);
  return (
    <>
      <Button
        ref={trigger}
        type="button"
        variant="ghost"
        size="icon-xs"
        className="cn-json-fold-toggle cursor-pointer rounded-sm text-muted-foreground"
        data-fold-toggle={gutter ? 'gutter' : 'inline'}
        data-annotation-controls=""
        aria-label={folded ? expand : t('Collapse JSON at line {line}, column {column}', position)}
        aria-expanded={!folded}
        onClick={toggle}
      >
        <svg viewBox="0 0 8 8" fill="currentColor" className="size-2" aria-hidden="true">
          <path d={folded ? 'M2.75 1.5 5.75 4 2.75 6.5Z' : 'M1.5 2.75h5L4 5.75Z'} />
        </svg>
      </Button>
      {folded && (
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="mx-0.5 h-auto cursor-pointer rounded border bg-muted px-1.5 py-0 font-mono text-sm leading-none text-muted-foreground select-none"
          data-fold-summary=""
          data-annotation-controls=""
          aria-label={expand}
          onClick={() => {
            trigger.current?.focus();
            toggle();
          }}
        >
          …
        </Button>
      )}
    </>
  );
}
