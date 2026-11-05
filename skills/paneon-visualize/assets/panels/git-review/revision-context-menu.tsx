import type { ReactElement } from 'react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@qoggy/paneon/ui';
import { useLocale } from '../../shared/i18n';

export function RevisionContextMenu({
  revision,
  onViewChanges,
  onCompare,
  onCheckout,
  onCopyRevision,
  children,
}: {
  revision: string;
  onViewChanges?: () => void;
  onCompare?: (revision: string) => void;
  onCheckout?: () => void;
  onCopyRevision?: () => void;
  children: ReactElement;
}) {
  const { t } = useLocale();
  if (!onViewChanges && !onCompare && !onCheckout && !onCopyRevision) return children;
  return (
    <ContextMenu>
      <ContextMenuTrigger render={children} />
      <ContextMenuContent onClick={(event) => event.stopPropagation()}>
        {onCopyRevision && (
          <ContextMenuItem onClick={onCopyRevision}>{t('Copy Revision Number')}</ContextMenuItem>
        )}
        {onViewChanges && (
          <ContextMenuItem onClick={onViewChanges}>{t('View Changes')}</ContextMenuItem>
        )}
        {onCheckout && <ContextMenuItem onClick={onCheckout}>{t('Checkout')}</ContextMenuItem>}
        {onCompare && (
          <ContextMenuItem onClick={() => onCompare(revision)}>
            {t('Compare with current branch')}
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
