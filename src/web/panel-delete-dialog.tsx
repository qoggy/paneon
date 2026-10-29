import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog';
import { useUI } from '../ui/use-ui';
import type { PanelSummary } from './api';

export default function PanelDeleteDialog({
  panel,
  trigger,
  onClose,
  onDelete,
}: {
  panel: PanelSummary;
  trigger: HTMLButtonElement;
  onClose: () => void;
  onDelete: (instanceId: string) => void;
}) {
  const { t } = useUI();
  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <AlertDialogContent finalFocus={() => trigger}>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('Delete panel?')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t(
              'This permanently deletes the panel and its interaction history. This cannot be undone.',
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <p className="text-sm break-all">
          {panel.definitionId} · {panel.instanceId}
        </p>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('Cancel')}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={() => onDelete(panel.instanceId)}>
            {t('Delete')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
