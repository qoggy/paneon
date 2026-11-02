import { useRef, useState } from 'react';
import { Check, ChevronDown, Folder, Plus, Trash2 } from '../../shared/icons.tsx';
import { DirectoryPicker } from '../../shared/directory-picker.tsx';
import type { DirectoryListing } from '../../shared/directory-picker.tsx';
import {
  Alert,
  AlertDescription,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldError,
  Input,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Spinner,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@qoggy/paneon/ui';
import { useLocale } from '../../shared/i18n';
import { queryDirectories, queryRepositoryDirectory } from './actions.ts';
import { absoluteDirectory } from './schema.ts';
import type { GitRepository } from './schema.ts';
import { repositoryLabels } from './input.ts';

export function RepositoryPicker({
  repositories,
  currentId,
  disabled,
  selectionDisabled,
  issues,
  removalReason,
  onSelect,
  onAdd,
  onRemove,
}: {
  repositories: GitRepository[];
  currentId: string;
  disabled: boolean;
  selectionDisabled: boolean;
  issues: Record<string, string>;
  removalReason: (id: string) => string | undefined;
  onSelect: (id: string) => void;
  onAdd: (repository: GitRepository) => void;
  onRemove: (id: string) => void;
}) {
  const { t, message } = useLocale();
  const labels = repositoryLabels(repositories);
  const repositoryLabel = (repository: GitRepository) => labels.get(repository.id);
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [path, setPath] = useState(''),
    [error, setError] = useState(''),
    [pending, setPending] = useState(false);
  const [directory, setDirectory] = useState<DirectoryListing>();
  const [selectedDirectory, setSelectedDirectory] = useState<string>();
  const [browsing, setBrowsing] = useState(false),
    [browsePending, setBrowsePending] = useState(false);
  const request = useRef(0),
    browseRequest = useRef(0);
  const activeRepositories = useRef(repositories);
  activeRepositories.current = repositories;
  const current = repositories.find((repository) => repository.id === currentId);
  function close() {
    request.current++;
    browseRequest.current++;
    setAdding(false);
    setPending(false);
    setBrowsing(false);
    setBrowsePending(false);
    setDirectory(undefined);
    setSelectedDirectory(undefined);
    setError('');
  }
  async function add() {
    if (pending || disabled) return;
    if (!absoluteDirectory.safeParse(path).success) {
      setError(t('Enter an absolute directory path.'));
      return;
    }
    const id = ++request.current;
    setPending(true);
    setError('');
    try {
      const result = await queryRepositoryDirectory({ path });
      if (id !== request.current) return;
      if (!result.ok) {
        setError(message(result.message));
        return;
      }
      if (activeRepositories.current.some((repo) => repo.path === result.data.path)) {
        setError(t('This repository is already in the list.'));
        return;
      }
      const repository = { id: crypto.randomUUID(), ...result.data };
      close();
      onAdd(repository);
    } catch (failure) {
      console.error('Repository lookup failed:', path, failure);
      if (id === request.current) setError(t('Unable to open this repository.'));
    } finally {
      if (id === request.current) setPending(false);
    }
  }
  async function browse(next: string) {
    if (!absoluteDirectory.safeParse(next).success) {
      setError(t('Enter an absolute directory path.'));
      return;
    }
    const id = ++browseRequest.current;
    setBrowsing(true);
    setBrowsePending(true);
    setSelectedDirectory(undefined);
    setError('');
    try {
      const result = await queryDirectories({ path: next });
      if (id !== browseRequest.current) return;
      if (result.ok) setDirectory(result.data);
      else setError(message(result.message));
    } catch (failure) {
      console.error('Directory listing failed:', next, failure);
      if (id === browseRequest.current) setError(t('Unable to read this directory.'));
    } finally {
      if (id === browseRequest.current) setBrowsePending(false);
    }
  }

  function backFromBrowse() {
    browseRequest.current++;
    setBrowsing(false);
    setBrowsePending(false);
    setError('');
  }
  function chooseDirectory() {
    if (!directory || browsePending || disabled) return;
    setPath(selectedDirectory ?? directory.path);
    backFromBrowse();
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              variant="secondary"
              disabled={selectionDisabled}
              aria-label={t('仓库')}
              aria-description={current && `${repositoryLabel(current)} · ${current.path}`}
              className="max-w-60 min-w-36 justify-between"
              title={current?.path}
            >
              <Folder aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-left">
                {current ? repositoryLabel(current) : currentId}
              </span>
              <ChevronDown aria-hidden="true" className="text-muted-foreground" />
            </Button>
          }
        />
        <PopoverContent
          align="start"
          aria-label={t('仓库')}
          className="w-[36rem] max-w-[calc(100vw-2rem)] p-0"
        >
          <div className="max-h-[60dvh] overflow-auto p-2">
            {repositories.map((repository) => {
              const reason = removalReason(repository.id);
              const blocked = disabled || !!reason;
              const selected = repository.id === currentId;
              return (
                <div
                  key={repository.id}
                  data-repository-id={repository.id}
                  className="flex items-center gap-1"
                >
                  <Button
                    variant="ghost"
                    disabled={selectionDisabled}
                    aria-pressed={selected}
                    aria-label={`${repositoryLabel(repository)} · ${repository.path}`}
                    aria-description={issues[repository.id] && message(issues[repository.id])}
                    className="h-auto min-w-0 flex-1 items-start justify-start gap-3 px-2 py-2 text-left text-xs font-normal whitespace-normal"
                    onClick={() => {
                      setOpen(false);
                      onSelect(repository.id);
                    }}
                  >
                    {selected ? (
                      <Check className="mt-0.5" aria-hidden="true" />
                    ) : (
                      <Folder className="mt-0.5 text-muted-foreground" aria-hidden="true" />
                    )}
                    <span className="min-w-0 flex-1 space-y-1">
                      <span className="block font-medium">{repositoryLabel(repository)}</span>
                      <span className="block text-xs font-normal break-all text-muted-foreground">
                        {repository.path}
                      </span>
                      {issues[repository.id] && (
                        <span className="block text-xs font-normal text-destructive">
                          {message(issues[repository.id])}
                        </span>
                      )}
                    </span>
                  </Button>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <span
                          className="inline-flex"
                          data-removal-control=""
                          tabIndex={blocked ? 0 : undefined}
                        >
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={t('Remove repository')}
                            disabled={blocked}
                            className="text-muted-foreground enabled:hover:text-destructive"
                            onClick={() => onRemove(repository.id)}
                          >
                            <Trash2 aria-hidden="true" />
                          </Button>
                        </span>
                      }
                    />
                    <TooltipContent>{reason ?? t('Remove repository')}</TooltipContent>
                  </Tooltip>
                </div>
              );
            })}
          </div>
          <div className="border-t p-2">
            <Button
              variant="ghost"
              disabled={disabled}
              className="w-full justify-start gap-3 px-2 text-xs font-normal"
              onClick={() => {
                setOpen(false);
                setPath('');
                setError('');
                setAdding(true);
              }}
            >
              <Plus aria-hidden="true" />
              {t('Add repository')}
            </Button>
          </div>
        </PopoverContent>
      </Popover>
      <Dialog
        open={adding}
        onOpenChange={(next) => {
          if (!next) close();
        }}
      >
        <DialogContent
          className={browsing ? 'gap-6 overflow-hidden p-0 transition-none' : 'transition-none'}
          style={browsing ? { maxWidth: 'min(42rem, calc(100vw - 2rem))' } : undefined}
        >
          <DialogHeader className={browsing ? 'px-6 pt-6' : undefined}>
            <DialogTitle>{t(browsing ? 'Choose a directory' : 'Add repository')}</DialogTitle>
          </DialogHeader>
          {browsing ? (
            <>
              <div className="px-6">
                <DirectoryPicker
                  directory={directory}
                  selectedPath={selectedDirectory}
                  pending={browsePending}
                  onNavigate={(path) => void browse(path)}
                  onSelect={setSelectedDirectory}
                />
              </div>
              {error && (
                <Alert variant="destructive" className="mx-6 w-auto">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <DialogFooter className="border-t px-6 py-4">
                <Button type="button" variant="outline" onClick={backFromBrowse}>
                  {t('Back')}
                </Button>
                <Button
                  type="button"
                  disabled={disabled || browsePending || !directory}
                  onClick={chooseDirectory}
                >
                  {t('Use this directory')}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <form
              className="space-y-4"
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                void add();
              }}
            >
              <Field className="gap-2">
                <Label htmlFor="git-repository-path" className="sr-only">
                  {t('Repository directory')}
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="git-repository-path"
                    value={path}
                    disabled={pending || disabled}
                    placeholder={t('Absolute path')}
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? 'git-repository-path-error' : undefined}
                    onChange={(event) => {
                      setPath(event.target.value);
                      setError('');
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                        event.preventDefault();
                        void add();
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={pending || disabled}
                    onClick={() =>
                      void browse(absoluteDirectory.safeParse(path).success ? path : current!.path)
                    }
                  >
                    {t('Browse…')}
                  </Button>
                </div>
                {error && <FieldError id="git-repository-path-error">{error}</FieldError>}
              </Field>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={close}>
                  {t('Cancel')}
                </Button>
                <Button type="button" disabled={pending || disabled} onClick={() => void add()}>
                  {pending && <Spinner />}
                  {t('Add')}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
