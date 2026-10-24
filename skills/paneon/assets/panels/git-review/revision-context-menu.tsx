import type { ReactElement } from 'react';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from 'paneon/ui';
import { useLocale } from '../../shared/i18n';

export function RevisionContextMenu({
  revision,
  onCompare,
  children,
}: {
  revision: string;
  onCompare?: (revision: string) => void;
  children: ReactElement;
}) {
  const { t } = useLocale();
  if (!onCompare) return children;
  return (
    <ContextMenu>
      <ContextMenuTrigger render={children} />
      <ContextMenuContent onClick={(event) => event.stopPropagation()}>
        <ContextMenuItem onClick={() => onCompare(revision)}>
          {t('Compare with current branch')}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
