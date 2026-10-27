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
  onCompare,
  onCheckout,
  children,
}: {
  revision: string;
  onCompare?: (revision: string) => void;
  onCheckout?: () => void;
  children: ReactElement;
}) {
  const { t } = useLocale();
  if (!onCompare && !onCheckout) return children;
  return (
    <ContextMenu>
      <ContextMenuTrigger render={children} />
      <ContextMenuContent onClick={(event) => event.stopPropagation()}>
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
