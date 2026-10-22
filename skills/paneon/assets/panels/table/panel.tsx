import { useMemo, useRef, useState } from 'react';
import { agent, definePanel, serverAction, usePanelInput, z } from 'paneon/sdk';
import type { Feedback, FeedbackTarget as Target } from 'paneon/sdk';
import {
  Button,
  Checkbox,
  FeedbackSurface,
  FeedbackToolbar,
  FeedbackProvider,
  FeedbackTarget,
  FeedbackText,
  Input,
  Markdown,
  Page,
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
  return (
    <div ref={root} className="space-y-4">
      <label className="block space-y-2">
        搜索全表
        <Input
          aria-label="搜索全表"
          value={view.search}
          onChange={(event) => update({ ...view, search: event.target.value })}
        />
      </label>
      <p className="text-sm text-muted-foreground">
        {rows.length} / {params.rows.length} 行 · 已选{' '}
        {feedback.value.annotations.reduce((count, entry) => count + entry.targets.length, 0)}{' '}
        个位置。列选择覆盖输入整列；表头行勾选只作用当前页。
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>
              {selecting && (
                <Checkbox
                  aria-label="选择当前页的行"
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
                <TableHead data-column-key={column.key}>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      aria-label={`排序 ${column.label}`}
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
                      {column.label}
                      {view.sort?.key === column.key ? (view.sort.descending ? ' ↓' : ' ↑') : ''}
                    </Button>
                    {selecting && (
                      <Checkbox
                        aria-label={`选择整列 ${column.label}`}
                        disabled={disabled || feedback.submitting}
                        checked={selected({ kind: 'column', columnKey: column.key })}
                        onCheckedChange={() =>
                          feedback.toggleTarget({ ref: { kind: 'column', columnKey: column.key } })
                        }
                      />
                    )}
                  </div>
                  <Input
                    aria-label={`筛选 ${column.label}`}
                    value={Object.hasOwn(view.filters, column.key) ? view.filters[column.key] : ''}
                    onChange={(event) =>
                      update({
                        ...view,
                        filters: { ...view.filters, [column.key]: event.target.value },
                      })
                    }
                  />
                </TableHead>
              </FeedbackTarget>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {shown.map(({ row, rowIndex }) => (
            <FeedbackTarget<TableRef> key={rowIndex} target={{ kind: 'row', rowIndex }} asChild>
              <TableRow data-row-index={rowIndex}>
                <TableCell>
                  {selecting ? (
                    <Checkbox
                      aria-label={`选择原始行 ${rowIndex}`}
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
                      <TableCell data-cell-key={column.key}>
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
        </TableBody>
      </Table>
      {!shown.length && <p>{params.rows.length ? '没有匹配结果。' : '表格没有数据。'}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" onClick={() => update(initialView)}>
          清除搜索和筛选
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={currentPage === 0}
          onClick={() => setPage(currentPage - 1)}
        >
          上一页
        </Button>
        <span>
          第 {currentPage + 1} / {pageCount} 页
        </span>
        <Button
          type="button"
          variant="outline"
          disabled={currentPage + 1 >= pageCount}
          onClick={() => setPage(currentPage + 1)}
        >
          下一页
        </Button>
      </div>
    </div>
  );
}
function TablePanel() {
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
    <Page title={params.title}>
      {params.description && <Markdown>{params.description}</Markdown>}
      <FeedbackProvider<TableRef>
        adapter={adapter}
        disabled={locked}
        onSubmit={async (feedback) => {
          if (!submission.hasReceipt && !feedback.annotations.length && !feedback.comment?.trim())
            throw new Error('请选择内容或填写意见后再提交。');
          await submission.submit(feedback);
        }}
      >
        <FeedbackSurface />
        <div className="flex flex-wrap items-center gap-2" aria-label="评论操作">
          <FeedbackToolbar />
          {locked && (
            <Button type="button" onClick={() => setLocked(false)}>
              修改反馈
            </Button>
          )}
        </div>
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
