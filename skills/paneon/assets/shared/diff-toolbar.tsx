import { Button } from 'paneon/ui';

function Arrow({ up }: { up: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={up ? 'M12 19V5m-6 6 6-6 6 6' : 'M12 5v14m-6-6 6 6 6-6'} />
    </svg>
  );
}

export function DiffToolbar({
  unified,
  expanded,
  current,
  total,
  onNavigate,
  onMode,
  onExpanded,
}: {
  unified: boolean;
  expanded: boolean;
  current: number;
  total: number;
  onNavigate: (index: number) => void;
  onMode: (unified: boolean) => void;
  onExpanded: () => void;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1" role="group" aria-label="差异操作">
      <Button
        size="sm"
        variant="ghost"
        disabled={!total}
        aria-label="定位当前差异"
        title="定位当前差异"
        onClick={() => onNavigate(current)}
      >
        {total ? `${current + 1} / ${total} 处差异` : '无差异'}
      </Button>
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label="上一个差异"
        title="上一个差异"
        disabled={!total || current === 0}
        onClick={() => onNavigate(current - 1)}
      >
        <Arrow up />
      </Button>
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label="下一个差异"
        title="下一个差异"
        disabled={!total || current === total - 1}
        onClick={() => onNavigate(current + 1)}
      >
        <Arrow up={false} />
      </Button>
      <div
        className="flex items-center rounded-md bg-muted p-0.5"
        role="group"
        aria-label="对比方式"
      >
        <Button
          size="sm"
          variant={unified ? 'ghost' : 'outline'}
          aria-pressed={!unified}
          onClick={() => onMode(false)}
        >
          左右对比
        </Button>
        <Button
          size="sm"
          variant={unified ? 'outline' : 'ghost'}
          aria-pressed={unified}
          onClick={() => onMode(true)}
        >
          单列对比
        </Button>
      </div>
      <Button size="sm" variant="ghost" onClick={onExpanded} aria-expanded={expanded}>
        {expanded ? '收起上下文' : '展开全部上下文'}
      </Button>
    </div>
  );
}
