import { Button } from 'paneon/ui';
import { useLocale } from './i18n';

/** Non-text Git/PR policy stays in the page, outside the public string diff component. */
export function FileDiffNotice({
  oldPath,
  newPath,
  oldRevision,
  newRevision,
  onCollapse,
}: {
  oldPath?: string;
  newPath?: string;
  oldRevision?: string;
  newRevision?: string;
  onCollapse?: () => void;
}) {
  const { t, message } = useLocale();
  return (
    <div className="min-w-0 space-y-2 border p-3" data-file-only-diff="">
      <div className="flex items-center justify-between gap-2">
        <div className="grid min-w-0 flex-1 grid-cols-2 gap-3 text-xs text-muted-foreground">
          <span className="truncate">{[oldRevision, oldPath].filter(Boolean).join(' · ')}</span>
          <span className="truncate">{[newRevision, newPath].filter(Boolean).join(' · ')}</span>
        </div>
        {onCollapse && (
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={onCollapse}
            aria-label={message('Collapse file diff')}
          >
            ×
          </Button>
        )}
      </div>
      <p className="text-sm text-muted-foreground">{t('This file has no text diff.')}</p>
    </div>
  );
}
