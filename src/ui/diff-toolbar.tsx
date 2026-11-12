import { ArrowDown, ArrowUp, ChevronDown, FoldVertical, WrapText } from 'lucide-react';
import { useUI } from './use-ui';
import { Button } from './button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from './dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip';

export function DiffToolbar({
  unified,
  expanded,
  wrap,
  current,
  total,
  onNavigate,
  onMode,
  onExpanded,
  onWrap,
}: {
  unified: boolean;
  expanded: boolean;
  wrap: boolean;
  current: number;
  total: number;
  onNavigate: (index: number) => void;
  onMode: (unified: boolean) => void;
  onExpanded: () => void;
  onWrap: () => void;
}) {
  const { t } = useUI();
  return (
    <div
      className="flex min-w-0 flex-wrap items-center gap-1"
      role="group"
      aria-label={t('差异操作')}
    >
      <div
        className="flex items-center gap-0.5"
        role="group"
        aria-label={t('Difference navigation')}
      >
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size="sm"
                variant="ghost"
                className="tabular-nums"
                disabled={!total}
                aria-label={t('定位当前差异')}
                onClick={() => onNavigate(current)}
              >
                {total ? t('{current} / {total}', { current: current + 1, total }) : t('无差异')}
              </Button>
            }
          />
          <TooltipContent>{t('定位当前差异')}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={t('上一个差异')}
                disabled={!total || current === 0}
                onClick={() => onNavigate(current - 1)}
              >
                <ArrowUp strokeWidth={1.5} aria-hidden="true" />
              </Button>
            }
          />
          <TooltipContent>{t('上一个差异')}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={t('下一个差异')}
                disabled={!total || current === total - 1}
                onClick={() => onNavigate(current + 1)}
              >
                <ArrowDown strokeWidth={1.5} aria-hidden="true" />
              </Button>
            }
          />
          <TooltipContent>{t('下一个差异')}</TooltipContent>
        </Tooltip>
      </div>
      <div className="mx-1 h-4 w-px shrink-0 bg-border" aria-hidden="true" />
      <div className="flex items-center gap-1" role="group" aria-label={t('Diff display options')}>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button size="sm" variant="ghost" aria-label={t('对比方式')} />}
          >
            {t(unified ? '单列对比' : '左右对比')}
            <ChevronDown strokeWidth={1.5} aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuRadioGroup value={unified ? 'unified' : 'split'}>
              <DropdownMenuRadioItem value="split" onClick={() => onMode(false)}>
                {t('左右对比')}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="unified" onClick={() => onMode(true)}>
                {t('单列对比')}
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant={wrap ? 'secondary' : 'ghost'}
                size="icon-sm"
                aria-label={t('Word wrap')}
                aria-pressed={wrap}
                onClick={onWrap}
              >
                <WrapText strokeWidth={1.5} aria-hidden="true" />
              </Button>
            }
          />
          <TooltipContent>
            {t(
              wrap ? 'Word wrap is on. Click to turn off.' : 'Word wrap is off. Click to turn on.',
            )}
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size="icon-sm"
                variant={expanded ? 'ghost' : 'secondary'}
                onClick={onExpanded}
                aria-label={t('Hide unchanged lines')}
                aria-pressed={!expanded}
                aria-expanded={expanded}
              >
                <FoldVertical strokeWidth={1.5} aria-hidden="true" />
              </Button>
            }
          />
          <TooltipContent>{t(expanded ? 'Hide unchanged lines' : 'Show all lines')}</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
