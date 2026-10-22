import { useLocale } from '../../shared/i18n';
import { useMemo, useRef, useState } from 'react';
import { agent, definePanel, serverAction, usePanelInput, z } from 'paneon/sdk';
import type { Feedback, FeedbackTarget as Target } from 'paneon/sdk';
import {
  Button,
  Checkbox,
  FeedbackSurface,
  FeedbackSelectionControls,
  FeedbackOverallCommentButton,
  FeedbackSubmitButton,
  FeedbackProvider,
  FeedbackTarget,
  FeedbackText,
  Input,
  Markdown,
  Page,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  useFeedback,
} from 'paneon/ui';
import { useSubmission } from '../../shared/submission';
import {
  cellText,
  completeTableSchema,
  tableParamsSchema,
  tableSubmittedSchema,
  tableTargetError,
  visibleRows,
} from './schema';
import type { TableParams, TableRef, TableView } from './schema';
export const validateTable = serverAction({
  input: z.object({ snapshot: tableParamsSchema, feedback: tableSubmittedSchema }).strict(),
  handler: (_ctx, input) => completeTableSchema(input.snapshot).parse(input.feedback),
});
const initialView: TableView = { search: '', filters: {}, sort: null };
function DataTable({
  params,
  disabled,
  view,
  setView,
  page,
  setPage,
  root,
}: {
  params: TableParams;
  disabled: boolean;
  view: TableView;
  setView: (view: TableView) => void;
  page: number;
  setPage: (page: number) => void;
  root: React.RefObject<HTMLDivElement | null>;
}) {
  const { t } = useLocale();
  const feedback = useFeedback<TableRef>();
  const rows = visibleRows(params, view),
    pageSize = params.pageSize ?? 20;
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const shown = rows.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const selecting = feedback.mode === 'select';
  const selected = (ref: TableRef) =>
    feedback.selectionTargets.some(
      (target) => !target.text && JSON.stringify(target.ref) === JSON.stringify(ref),
    );
  function update(next: TableView) {
    setView(next);
    setPage(0);
  }
  function togglePage() {
    const refs = shown.map(({ rowIndex }) => ({ kind: 'row' as const, rowIndex }));
    const all = refs.every(selected);
    for (const ref of refs) if (selected(ref) === all) feedback.toggleTarget({ ref });
  }
  const activeFilters = params.columns.filter(
    (column) => Object.hasOwn(view.filters, column.key) && view.filters[column.key].length > 0,
  );
  const hasView = !!view.search || activeFilters.length > 0 || !!view.sort;
  function removeFilter(key: string) {
    const filters = { ...view.filters };
    delete filters[key];
    update({ ...view, filters });
  }
  return (
    <div ref={root} className="min-w-0 space-y-3">
      <div
        className="flex flex-wrap items-center justify-between gap-2"
        aria-label={t('表格工具栏')}
      >
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <div className="relative w-72 max-w-full min-w-32 flex-1 sm:flex-none">
            <Input
              type="search"
              aria-label={t('搜索全表')}
              placeholder={t('搜索表格…')}
              className="pr-9 [&::-webkit-search-cancel-button]:appearance-none"
              value={view.search}
              onChange={(event) => update({ ...view, search: event.target.value })}
            />
            {view.search && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="absolute top-0.5 right-0.5"
                aria-label={t('清除搜索')}
                onClick={() => update({ ...view, search: '' })}
              >
                <span aria-hidden="true">×</span>
              </Button>
            )}
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button type="button" variant="outline" aria-label={t('筛选列')}>
                {t('筛选')}
                {activeFilters.length > 0 && ` (${activeFilters.length})`}
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              collisionPadding={16}
              className="max-h-[min(28rem,var(--radix-popover-content-available-height))] w-80 max-w-[calc(100vw-2rem)] space-y-3 overflow-auto"
              aria-label={t('列筛选')}
            >
              {params.columns.map((column) => (
                <label key={column.key} className="block space-y-1.5 text-sm break-words">
                  <span>{column.label}</span>
                  <Input
                    aria-label={t('Filter {label}', { label: column.label })}
                    placeholder={t('包含…')}
                    value={Object.hasOwn(view.filters, column.key) ? view.filters[column.key] : ''}
                    onChange={(event) =>
                      update({
                        ...view,
                        filters: { ...view.filters, [column.key]: event.target.value },
                      })
                    }
                  />
                </label>
              ))}
            </PopoverContent>
          </Popover>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FeedbackSelectionControls />
          {selecting && (
            <Popover>
              <PopoverTrigger asChild>
                <Button type="button" size="icon-sm" variant="ghost" aria-label={t('选择帮助')}>
                  <span aria-hidden="true">?</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                collisionPadding={16}
                className="max-w-[calc(100vw-2rem)] text-sm"
                aria-label={t('选择帮助')}
              >
                {t(
                  '列选择覆盖输入整列；表头行勾选只作用当前页。选择行、列或单元格后，点击「评论」保存到页面草稿。普通文字圈选无需开启选择对象。',
                )}
              </PopoverContent>
            </Popover>
          )}
        </div>
      </div>
      {hasView && (
        <div className="flex flex-wrap items-center gap-2" aria-label={t('当前视图条件')}>
          {activeFilters.map((column) => (
            <Button
              key={column.key}
              type="button"
              size="xs"
              variant="outline"
              className="h-auto min-h-7 max-w-full whitespace-normal"
              aria-label={t('Remove filter {label}', { label: column.label })}
              onClick={() => removeFilter(column.key)}
            >
              <span className="min-w-0 text-left break-all">
                {column.label}：{view.filters[column.key]}
              </span>
              <span aria-hidden="true">×</span>
            </Button>
          ))}
          <Button type="button" size="xs" variant="ghost" onClick={() => update(initialView)}>
            {t('重置视图')}
          </Button>
        </div>
      )}
      <div className="min-w-0 overflow-hidden rounded-md border">
        <Table aria-label={params.title}>
          <TableHeader>
            <TableRow>
              <TableHead className="h-10 w-10 px-3 text-center">
                {selecting && (
                  <Checkbox
                    aria-label={t('选择当前页的行')}
                    disabled={disabled || feedback.submitting || !shown.length}
                    checked={
                      shown.length > 0 &&
                      shown.every(({ rowIndex }) => selected({ kind: 'row', rowIndex }))
                    }
                    onCheckedChange={togglePage}
                  />
                )}
              </TableHead>
              {params.columns.map((column) => (
                <FeedbackTarget<TableRef>
                  key={column.key}
                  target={{ kind: 'column', columnKey: column.key }}
                  asChild
                >
                  <TableHead
                    data-column-key={column.key}
                    aria-sort={
                      view.sort?.key === column.key
                        ? view.sort.descending
                          ? 'descending'
                          : 'ascending'
                        : 'none'
                    }
                    className={`h-10 px-3 py-1 whitespace-normal ${column.type === 'number' ? 'w-px min-w-24 text-right' : column.type === 'boolean' ? 'w-px min-w-20' : 'min-w-40'}`}
                  >
                    <div
                      className={`flex items-center gap-2 ${column.type === 'number' ? 'justify-end' : ''}`}
                    >
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className={`h-auto min-h-8 min-w-0 shrink gap-1 px-0 whitespace-normal ${column.type === 'number' ? 'text-right' : 'text-left'}`}
                        aria-label={t('Sort {label}', { label: column.label })}
                        onClick={() =>
                          update({
                            ...view,
                            sort: {
                              key: column.key,
                              descending:
                                view.sort?.key === column.key ? !view.sort.descending : false,
                            },
                          })
                        }
                      >
                        <span className="wrap-anywhere">{column.label}</span>
                        <span aria-hidden="true" className="shrink-0 text-xs text-muted-foreground">
                          {view.sort?.key === column.key ? (view.sort.descending ? '↓' : '↑') : '↕'}
                        </span>
                      </Button>
                      {selecting && (
                        <Checkbox
                          aria-label={t('Select entire column {label}', { label: column.label })}
                          disabled={disabled || feedback.submitting}
                          checked={selected({ kind: 'column', columnKey: column.key })}
                          onCheckedChange={() =>
                            feedback.toggleTarget({
                              ref: { kind: 'column', columnKey: column.key },
                            })
                          }
                        />
                      )}
                    </div>
                  </TableHead>
                </FeedbackTarget>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map(({ row, rowIndex }) => (
              <FeedbackTarget<TableRef> key={rowIndex} target={{ kind: 'row', rowIndex }} asChild>
                <TableRow data-row-index={rowIndex}>
                  <TableCell className="h-10 w-10 px-3 py-2 text-center text-xs text-muted-foreground">
                    {selecting ? (
                      <Checkbox
                        aria-label={t('Select original row {index}', { index: rowIndex })}
                        disabled={disabled || feedback.submitting}
                        checked={selected({ kind: 'row', rowIndex })}
                        onCheckedChange={() =>
                          feedback.toggleTarget({ ref: { kind: 'row', rowIndex } })
                        }
                      />
                    ) : (
                      rowIndex + 1
                    )}
                  </TableCell>
                  {params.columns.map((column) => {
                    const ref: TableRef = { kind: 'cell', rowIndex, columnKey: column.key };
                    return (
                      <FeedbackTarget key={column.key} target={ref} asChild>
                        <TableCell
                          data-cell-key={column.key}
                          className={`h-10 px-3 py-2 ${column.type === 'number' ? 'w-px text-right tabular-nums' : column.type === 'boolean' ? 'w-px' : 'max-w-xl min-w-40 wrap-anywhere whitespace-normal'}`}
                        >
                          {typeof row[column.key] === 'string' ? (
                            <FeedbackText target={ref} text={String(row[column.key])} />
                          ) : (
                            cellText(row[column.key])
                          )}
                        </TableCell>
                      </FeedbackTarget>
                    );
                  })}
                </TableRow>
              </FeedbackTarget>
            ))}
            {!shown.length && (
              <TableRow>
                <TableCell
                  colSpan={params.columns.length + 1}
                  className="h-24 text-center text-muted-foreground"
                >
                  {params.rows.length ? t('没有匹配结果。') : t('表格没有数据。')}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <p aria-live="polite" data-table-statistics="">
          {shown.length ? currentPage * pageSize + 1 : 0}–{currentPage * pageSize + shown.length} /{' '}
          {rows.length} {t('行')}
          {rows.length !== params.rows.length &&
            t(' · {count} original rows', { count: params.rows.length })}
        </p>
        <nav className="flex items-center gap-1" aria-label={t('表格分页')}>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={t('上一页')}
            disabled={currentPage === 0}
            onClick={() => setPage(currentPage - 1)}
          >
            <span aria-hidden="true">‹</span>
          </Button>
          <span className="px-1 tabular-nums">
            {currentPage + 1} / {pageCount}
          </span>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={t('下一页')}
            disabled={currentPage + 1 >= pageCount}
            onClick={() => setPage(currentPage + 1)}
          >
            <span aria-hidden="true">›</span>
          </Button>
        </nav>
      </div>
    </div>
  );
}
function TablePanel() {
  const { t } = useLocale();
  const params = usePanelInput<TableParams>();
  const [view, setView] = useState<TableView>(initialView),
    [page, setPage] = useState(0),
    [locked, setLocked] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const submission = useSubmission<Feedback<TableRef>>(async (feedback) => {
    const validated = await validateTable({ snapshot: params, feedback });
    const receipt = await agent.emit('table-submitted', validated);
    setLocked(true);
    return receipt;
  });
  const adapter = useMemo(
    () => ({
      resolve(target: Target<TableRef>) {
        const message = tableTargetError(params, target);
        if (message) return { status: 'stale' as const, message };
        const ref = target.ref;
        return {
          status: 'ready' as const,
          ...(ref.kind === 'cell' && typeof params.rows[ref.rowIndex][ref.columnKey] === 'string'
            ? { text: params.rows[ref.rowIndex][ref.columnKey] as string }
            : {}),
        };
      },
      async locate(target: Target<TableRef>) {
        setView(initialView);
        const ref = target.ref;
        if ('rowIndex' in ref) setPage(Math.floor(ref.rowIndex / (params.pageSize ?? 20)));
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );
        const row =
          'rowIndex' in ref
            ? root.current?.querySelector<HTMLElement>(`[data-row-index="${ref.rowIndex}"]`)
            : null;
        const element =
          ref.kind === 'column'
            ? [...(root.current?.querySelectorAll<HTMLElement>('[data-column-key]') ?? [])].find(
                (node) => node.dataset.columnKey === ref.columnKey,
              )
            : ref.kind === 'row'
              ? row
              : [...(row?.querySelectorAll<HTMLElement>('[data-cell-key]') ?? [])].find(
                  (node) => node.dataset.cellKey === ref.columnKey,
                );
        element?.scrollIntoView({ block: 'center', inline: 'center' });
        element?.animate(
          [{ outline: '2px solid var(--ring)' }, { outline: '2px solid transparent' }],
          1500,
        );
      },
    }),
    [params],
  );
  return (
    <Page className="min-w-0 space-y-4">
      <FeedbackProvider<TableRef>
        adapter={adapter}
        disabled={locked}
        onSubmit={async (feedback) => {
          if (!submission.hasReceipt && !feedback.annotations.length && !feedback.comment?.trim()) {
            submission.reject('Select content or write a comment before submitting.');
            return;
          }
          await submission.submit(feedback);
        }}
      >
        <FeedbackSurface />
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="text-2xl font-semibold tracking-tight wrap-anywhere">{params.title}</h1>
            {params.description && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    size="sm"
                    variant="link"
                    className="px-0 text-muted-foreground"
                    aria-label={t('表格说明')}
                  >
                    {t('说明')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  collisionPadding={16}
                  className="max-h-[min(28rem,var(--radix-popover-content-available-height))] w-96 max-w-[calc(100vw-2rem)] overflow-auto"
                  aria-label={t('表格说明')}
                >
                  <Markdown>{params.description}</Markdown>
                </PopoverContent>
              </Popover>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2" aria-label={t('评论操作')}>
            <FeedbackOverallCommentButton />
            <FeedbackSubmitButton />
            {locked && (
              <Button type="button" onClick={() => setLocked(false)}>
                {t('修改反馈')}
              </Button>
            )}
          </div>
        </header>
        <DataTable
          params={params}
          disabled={locked}
          view={view}
          setView={setView}
          page={page}
          setPage={setPage}
          root={root}
        />
        {submission.message && (
          <p role={submission.failed ? 'alert' : 'status'}>{submission.message}</p>
        )}
      </FeedbackProvider>
    </Page>
  );
}
export default definePanel({
  id: 'table',
  requires: { paneon: '0.0.0' },
  input: tableParamsSchema,
  events: { 'table-submitted': tableSubmittedSchema },
  render: TablePanel,
});
