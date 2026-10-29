import { useId, useRef, useState } from 'react';
import {
  Badge,
  Button,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Separator,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@qoggy/paneon/ui';
import { useLocale } from '../../shared/i18n';
import type { GitRevision } from './git.ts';

export function RevisionPicker({
  label,
  value,
  valueLabel,
  prefix,
  revisions,
  onChange,
  emptyTree,
}: {
  label: string;
  value: string;
  valueLabel?: string;
  prefix: string;
  revisions: GitRevision[];
  onChange: (value: string) => void;
  emptyTree?: { selected: boolean; onSelect: () => void };
}) {
  const { t } = useLocale();
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(-1);
  const [kind, setKind] = useState<GitRevision['kind']>('branch');
  const matches = revisions.filter(
    (entry) =>
      entry.kind === kind && entry.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );
  const optionCount = matches.length + (query ? 1 : 0);
  function choose(revision: string) {
    onChange(revision);
    setOpen(false);
  }
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setQuery('');
          setActive(-1);
          setKind(
            revisions.find((entry) => entry.name === value || entry.ref === value)?.kind ??
              'branch',
          );
        }
      }}
    >
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            role="combobox"
            aria-label={label}
            aria-expanded={open}
            aria-controls={`${id}-list-${kind}`}
            className="max-w-72 min-w-40 justify-between font-normal"
            title={valueLabel ?? value}
          >
            <span className="shrink-0 text-muted-foreground">{prefix}</span>
            <span className="min-w-0 flex-1 truncate text-left font-medium">
              {valueLabel ?? (value || t('Choose a revision'))}
            </span>
            <svg
              viewBox="0 0 16 16"
              className="size-4 shrink-0 text-muted-foreground"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden="true"
            >
              <path d="m4 6 4 4 4-4" />
            </svg>
          </Button>
        }
      />
      <PopoverContent
        align="start"
        className="w-96 p-0"
        aria-labelledby={`${id}-title`}
        initialFocus={input}
      >
        <div className="flex items-center justify-between gap-2 px-3 py-1.5">
          <h2 id={`${id}-title`} className="text-sm font-medium">
            {t('Choose {label}', { label })}
          </h2>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t('关闭')}
            onClick={() => setOpen(false)}
          >
            <svg
              viewBox="0 0 16 16"
              className="size-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden="true"
            >
              <path d="m4 4 8 8M12 4l-8 8" />
            </svg>
          </Button>
        </div>
        <Separator />
        {emptyTree && (
          <>
            <div className="p-1">
              <Button
                variant="ghost"
                aria-pressed={emptyTree.selected}
                className="h-8 w-full justify-start font-normal"
                onClick={() => {
                  emptyTree.onSelect();
                  setOpen(false);
                }}
              >
                <span className="flex size-4 shrink-0 items-center" aria-hidden="true">
                  {emptyTree.selected && (
                    <svg
                      viewBox="0 0 16 16"
                      className="size-4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    >
                      <path d="m3 8 3 3 7-7" />
                    </svg>
                  )}
                </span>
                {t('Empty tree')}
              </Button>
            </div>
            <Separator />
          </>
        )}
        <div className="p-2">
          <Input
            ref={input}
            aria-label={`${label}: ${t('搜索分支或标签')}`}
            role="combobox"
            aria-expanded={open}
            aria-controls={`${id}-list-${kind}`}
            aria-autocomplete="list"
            aria-activedescendant={active >= 0 ? `${id}-${kind}-${active}` : undefined}
            autoComplete="off"
            placeholder={t('Branch, tag or commit ID')}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(-1);
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                setActive((index) =>
                  event.key === 'ArrowDown'
                    ? Math.min(index + 1, optionCount - 1)
                    : index < 0
                      ? optionCount - 1
                      : Math.max(index - 1, 0),
                );
              } else if (event.key === 'Enter') {
                event.preventDefault();
                if (matches[active]) choose(matches[active].name);
                else if (query) choose(query);
              }
            }}
          />
        </div>
        <Separator />
        <Tabs
          value={kind}
          onValueChange={(next) => {
            setKind(next as GitRevision['kind']);
            setActive(-1);
          }}
          className="gap-0"
        >
          <TabsList variant="line" aria-label={t('Revision type')} className="mx-2 mt-1">
            <TabsTrigger value="branch">{t('Branches')}</TabsTrigger>
            <TabsTrigger value="tag">{t('标签')}</TabsTrigger>
          </TabsList>
          <Separator />
          <TabsContent key={kind} value={kind}>
            <div
              id={`${id}-list-${kind}`}
              role="listbox"
              aria-label={label}
              className="max-h-72 overflow-auto p-1"
            >
              {matches.map((entry, index) => (
                <div key={entry.ref}>
                  <Button
                    id={`${id}-${kind}-${index}`}
                    role="option"
                    aria-selected={value === entry.name}
                    variant="ghost"
                    className={`h-8 w-full justify-start font-normal ${active === index ? 'bg-accent text-accent-foreground' : ''}`}
                    title={entry.ref}
                    tabIndex={-1}
                    ref={(element) => {
                      if (active === index) element?.scrollIntoView({ block: 'nearest' });
                    }}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => choose(entry.name)}
                  >
                    <span className="flex size-4 shrink-0 items-center" aria-hidden="true">
                      {value === entry.name && (
                        <svg
                          viewBox="0 0 16 16"
                          className="size-4"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                        >
                          <path d="m3 8 3 3 7-7" />
                        </svg>
                      )}
                    </span>
                    <span className="truncate">{entry.name}</span>
                    {entry.isDefault && (
                      <Badge variant="outline" className="ml-auto text-muted-foreground">
                        default
                      </Badge>
                    )}
                  </Button>
                </div>
              ))}
              {matches.length === 0 && (
                <p className="px-2 py-3 text-sm text-muted-foreground">
                  {t('没有匹配的分支或标签。')}
                </p>
              )}
              {query && (
                <>
                  <Separator className="my-1" />
                  <Button
                    id={`${id}-${kind}-${matches.length}`}
                    role="option"
                    aria-label={t('Use revision {revision}', { revision: query })}
                    aria-selected={value === query}
                    variant="ghost"
                    className={`h-9 w-full justify-start font-normal ${active === matches.length ? 'bg-accent text-accent-foreground' : ''}`}
                    tabIndex={-1}
                    ref={(element) => {
                      if (active === matches.length) element?.scrollIntoView({ block: 'nearest' });
                    }}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => choose(query)}
                  >
                    <span className="shrink-0">{t('Use this revision')}</span>
                    <code className="truncate text-xs text-muted-foreground">{query}</code>
                  </Button>
                </>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </PopoverContent>
    </Popover>
  );
}
