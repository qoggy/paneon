import { useEffect, useId, useRef, useState } from 'react';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  RadioGroup,
  RadioGroupItem,
  Spinner,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@qoggy/paneon/ui';
import { ChevronDown, Search, X } from '../../shared/icons.tsx';
import { useLocale } from '../../shared/i18n';
import { queryGitAuthors } from './actions.ts';
import type { GitRepository } from './schema.ts';
import type { GitAuthor, HistoryFilter } from './history-filter.ts';

export function HistoryFilters({
  repositories,
  repositoryId,
  tip,
  filter,
  onChange,
  error,
}: {
  repositories: GitRepository[];
  repositoryId: string;
  tip?: string;
  filter: HistoryFilter;
  onChange: (filter: HistoryFilter) => void;
  error: string;
}) {
  const { t } = useLocale();
  const [text, setText] = useState(filter.text ?? '');
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [catalog, setCatalog] = useState<{ authors: GitAuthor[]; me: string }>();
  const [authorError, setAuthorError] = useState('');
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setText(filter.text ?? '');
  }, [filter.text]);
  useEffect(() => {
    let active = true;
    setCatalog(undefined);
    setAuthorError('');
    void queryGitAuthors({ params: { repositories }, repositoryId, tip }).then(
      (result) => {
        if (active) setCatalog(result);
      },
      (failure) => {
        if (active) setAuthorError(String(failure));
      },
    );
    return () => {
      active = false;
    };
  }, [repositories, repositoryId, tip]);
  const authorLabel = !filter.author
    ? t('All authors')
    : filter.author === 'me'
      ? 'me'
      : filter.author.name;
  const matches =
    catalog?.authors.filter((author) =>
      `${author.name} ${author.email}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
    ) ?? [];
  const selectedAuthor = !filter.author
    ? 'all'
    : filter.author === 'me'
      ? 'me'
      : JSON.stringify(filter.author);
  function toggle(kind: 'regex' | 'matchCase') {
    onChange({ ...filter, text, [kind]: !filter[kind] });
  }
  function clearText() {
    setText('');
    onChange({ ...filter, text: '' });
    input.current?.focus();
  }
  return (
    <div className="shrink-0" data-history-filters="">
      <div className="flex h-[33px] min-w-0 items-center gap-1 px-1">
        <div className="relative min-w-0 flex-1" data-history-text-filter="">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={input}
            aria-label={t('Text or hash')}
            placeholder={t('Text or hash')}
            className="h-7 pr-24 pl-8"
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                event.preventDefault();
                onChange({ ...filter, text });
              }
            }}
            onBlur={(event) => {
              if (
                !(event.relatedTarget instanceof Element) ||
                !event.relatedTarget.closest('[data-history-text-filter]')
              )
                onChange({ ...filter, text });
            }}
          />
          <div className="absolute inset-y-0 right-1 flex items-center gap-0.5">
            {text && (
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={t('Clear commit search')}
                onMouseDown={(event) => event.preventDefault()}
                onClick={clearText}
              >
                <X />
              </Button>
            )}
            {(['regex', 'matchCase'] as const).map((kind) => (
              <Tooltip key={kind}>
                <TooltipTrigger
                  render={
                    <Button
                      variant={filter[kind] ? 'secondary' : 'ghost'}
                      size="icon-xs"
                      aria-label={kind === 'regex' ? t('Regular expression') : t('Match case')}
                      aria-pressed={!!filter[kind]}
                      onClick={() => toggle(kind)}
                    >
                      {kind === 'regex' ? '.*' : 'Cc'}
                    </Button>
                  }
                />
                <TooltipContent>
                  {kind === 'regex' ? t('Git extended regular expression (ERE)') : t('Match case')}
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        </div>
        <div className="relative flex max-w-[40%] min-w-0 items-center">
          <Popover
            open={open}
            onOpenChange={(next) => {
              setOpen(next);
              if (next) setQuery('');
            }}
          >
            <PopoverTrigger
              render={
                <Button
                  variant="ghost"
                  aria-label={t('Filter by author')}
                  className={`h-7 min-w-0 shrink justify-start px-2 font-normal ${filter.author ? 'pr-7' : ''}`}
                  title={`User: ${authorLabel}`}
                >
                  <span className="truncate">
                    {filter.author ? (
                      <>
                        <span className="text-muted-foreground">User:</span> {authorLabel}
                      </>
                    ) : (
                      'User'
                    )}
                  </span>
                  {!filter.author && <ChevronDown />}
                </Button>
              }
            />
            <PopoverContent
              align="start"
              className="w-80 max-w-[calc(100vw-2rem)] space-y-2 p-2 text-sm"
            >
              <Input
                aria-label={t('Search authors')}
                placeholder={t('Name or email')}
                className="h-7 px-2"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              {!catalog && !authorError && <Spinner aria-label={t('Loading authors…')} />}
              {authorError && (
                <p role="alert" className="text-sm text-destructive">
                  {authorError}
                </p>
              )}
              <RadioGroup
                aria-label={t('Authors')}
                value={selectedAuthor}
                onValueChange={(value) => {
                  const author =
                    value === 'all'
                      ? undefined
                      : value === 'me'
                        ? ('me' as const)
                        : catalog?.authors.find((author) => JSON.stringify(author) === value);
                  onChange({ ...filter, author });
                  setOpen(false);
                }}
                className="max-h-72 gap-0.5 overflow-auto"
              >
                <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-accent">
                  <RadioGroupItem value="all" />
                  {t('All authors')}
                </label>
                <label className="flex min-w-0 items-center gap-2 rounded px-2 py-1 hover:bg-accent">
                  <RadioGroupItem value="me" disabled={!catalog?.me} />
                  <span className="min-w-0">
                    <span className="block truncate">me</span>
                    {catalog?.me && (
                      <span className="block truncate text-xs text-muted-foreground">
                        {catalog.me}
                      </span>
                    )}
                  </span>
                </label>
                {catalog && !catalog.me && (
                  <p className="px-2 text-xs text-muted-foreground">
                    {t('Configure user.email to use me.')}
                  </p>
                )}
                {matches
                  .filter((author) => author.email !== catalog?.me)
                  .map((author, index) => (
                    <label
                      key={JSON.stringify(author)}
                      htmlFor={`${id}-${index}`}
                      className="flex min-w-0 cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-accent"
                    >
                      <RadioGroupItem id={`${id}-${index}`} value={JSON.stringify(author)} />
                      <span className="min-w-0">
                        <span className="block truncate text-sm">{author.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {author.email}
                        </span>
                      </span>
                    </label>
                  ))}
                {catalog && matches.length === 0 && (
                  <p className="px-2 py-1 text-sm text-muted-foreground">
                    {t('No matching authors.')}
                  </p>
                )}
              </RadioGroup>
            </PopoverContent>
          </Popover>
          {filter.author && (
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={t('Clear author filter')}
              className="absolute right-0 h-7 text-muted-foreground hover:text-foreground"
              onClick={() => onChange({ ...filter, author: undefined })}
            >
              <X className="size-4" />
            </Button>
          )}
        </div>
      </div>
      {error && (
        <Alert variant="destructive" className="mx-1 mt-1 w-auto">
          <AlertTitle>{t('读取失败')}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
