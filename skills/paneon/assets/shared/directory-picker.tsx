import { Fragment, useState } from 'react';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  Input,
  Spinner,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@qoggy/paneon/ui';
import { useLocale } from './i18n';
import { ArrowLeft, Check, Folder, Search, X } from './icons.tsx';

export type DirectoryListing = {
  path: string;
  parent: string;
  directories: { name: string; path: string }[];
};

function breadcrumbs(path: string) {
  const root = /^[a-zA-Z]:[\\/]|^\\\\[^\\]+\\[^\\]+(?:\\|$)|^\//.exec(path)?.[0] ?? '';
  const separator = root.includes('\\') ? '\\' : '/';
  const prefix = root.endsWith(separator) ? root : `${root}${separator}`;
  const parts = path.slice(root.length).split(/[\\/]/).filter(Boolean);
  return [
    { name: root, path: root },
    ...parts.map((name, index) => ({
      name,
      path: prefix + parts.slice(0, index + 1).join(separator),
    })),
  ];
}

/** Controlled directory selection; callers own filesystem reads, validation and confirmation. */
export function DirectoryPicker({
  directory,
  selectedPath,
  pending,
  onNavigate,
  onSelect,
}: {
  directory?: DirectoryListing;
  selectedPath?: string;
  pending: boolean;
  onNavigate: (path: string) => void;
  onSelect: (path: string) => void;
}) {
  const { t } = useLocale();
  const [filter, setFilter] = useState('');
  const entries = directory?.directories.filter((entry) =>
    entry.name.toLowerCase().includes(filter.toLowerCase()),
  );
  function navigate(path: string) {
    setFilter('');
    onNavigate(path);
  }
  return (
    <section className="space-y-2" aria-label={t('Choose a directory')} data-directory-picker="">
      <div className="flex min-w-0 items-center gap-3">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                size="icon"
                variant="outline"
                aria-label={t('Parent directory')}
                disabled={pending || !directory || directory.parent === directory.path}
                onClick={() => directory && navigate(directory.parent)}
              >
                <ArrowLeft aria-hidden="true" />
              </Button>
            }
          />
          <TooltipContent>{t('Parent directory')}</TooltipContent>
        </Tooltip>
        <Breadcrumb className="min-w-0 overflow-x-auto" aria-label={t('Directory path')}>
          <BreadcrumbList className="flex-nowrap gap-1">
            {directory &&
              breadcrumbs(directory.path).map((entry, index) => (
                <Fragment key={entry.path}>
                  {index > 0 && !(index === 1 && directory.path.startsWith('/')) && (
                    <BreadcrumbSeparator>/</BreadcrumbSeparator>
                  )}
                  <BreadcrumbItem className="shrink-0">
                    <BreadcrumbLink
                      render={
                        <Button
                          type="button"
                          variant="link"
                          size="sm"
                          className="px-1 font-normal text-foreground"
                          disabled={pending}
                        />
                      }
                      title={entry.path}
                      aria-current={entry.path === directory.path ? 'page' : undefined}
                      onClick={() => navigate(entry.path)}
                    >
                      {entry.name}
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                </Fragment>
              ))}
          </BreadcrumbList>
        </Breadcrumb>
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" />
        <Input
          aria-label={t('Filter directories in this folder')}
          placeholder={t('Filter directories in this folder')}
          className="pr-10 pl-9"
          value={filter}
          disabled={pending || !directory}
          onChange={(event) => setFilter(event.target.value)}
        />
        {filter && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute top-1/2 right-1 size-7 -translate-y-1/2"
            aria-label={t('Clear search')}
            onClick={() => setFilter('')}
          >
            <X />
          </Button>
        )}
      </div>
      <div className="h-60 overflow-auto rounded-md border" aria-label={t('Subdirectories')}>
        {pending ? (
          <div
            className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground"
            role="status"
          >
            <Spinner />
            {t('Reading directories…')}
          </div>
        ) : (
          directory &&
          (entries?.length ? (
            entries.map((entry) => (
              <Button
                key={entry.path}
                type="button"
                variant="ghost"
                aria-pressed={selectedPath === entry.path}
                className={`h-11 w-full justify-start rounded-none border-b px-4 last:border-b-0 ${selectedPath === entry.path ? 'bg-muted' : ''}`}
                onClick={() => onSelect(entry.path)}
                onDoubleClick={() => navigate(entry.path)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    navigate(entry.path);
                  }
                }}
              >
                <Folder className="text-blue-500" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-left">{entry.name}</span>
                {selectedPath === entry.path && <Check aria-hidden="true" />}
              </Button>
            ))
          ) : (
            <Empty className="h-full border-0">
              <EmptyHeader>
                <EmptyDescription>
                  {t(
                    directory.directories.length
                      ? 'No matching directories.'
                      : 'No subdirectories.',
                  )}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ))
        )}
      </div>
      <div className="min-h-12 space-y-1 text-sm">
        <p>{t('Selected directory')}</p>
        <p className="break-all text-muted-foreground" aria-live="polite">
          {selectedPath ?? directory?.path}
        </p>
      </div>
    </section>
  );
}
