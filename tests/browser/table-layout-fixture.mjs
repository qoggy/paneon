import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { startTableReviewFixture } from './table-review-fixture.mjs';

export const longNote =
  '原文前缀 中文🙂 原文。' +
  '这是一段必须自然换行且保留源文本坐标的说明，不能截断或插入额外文本。'.repeat(8) +
  '\n原始换行后的结尾。' +
  'unbrokentext'.repeat(24);
export const layoutInput = {
  title: '服务数据评审',
  description:
    '试试**排序、筛选、分页**，选择行、列、单元格或词语后评论。\n\n完整说明的第二段保留在这里。',
  pageSize: 3,
  columns: [
    { key: 'service', label: '服务' },
    { key: 'latency', label: '耗时 ms', type: 'number' },
    { key: 'healthy', label: '健康', type: 'boolean' },
    { key: 'note', label: '说明' },
  ],
  rows: [
    { service: 'API', latency: 120, healthy: true, note: '同步接口，等待数据库返回' },
    { service: 'Worker', latency: 900, healthy: true, note: '后台批处理任务' },
    { service: 'Search', latency: 240, healthy: false, note: '索引更新延迟，需要排查' },
    { service: 'Scheduler', latency: 80, healthy: true, note: '定时调度任务' },
    { service: 'Gateway', latency: 35, healthy: true, note: '请求路由与鉴权' },
  ],
};
export async function startTableLayoutFixture() {
  const fixture = await startTableReviewFixture();
  let serial = 0;
  const run = async (input) => {
    const params = join(fixture.root, `table-layout-${serial++}.json`);
    await writeFile(params, JSON.stringify(input));
    return fixture.cli(
      'run',
      join(fixture.root, 'agent-skills/paneon/assets/panels/table/panel.tsx'),
      '--cwd',
      fixture.root,
      '--params-file',
      params,
      '--no-watch',
    );
  };
  try {
    const normal = await run(layoutInput);
    const long = await run({
      ...layoutInput,
      title: '长列名与原文评审',
      columns: layoutInput.columns.map((column) =>
        column.key === 'note'
          ? {
              ...column,
              label: '这是一个需要完整呈现的很长列名LongColumnNameWithoutSpaces'.repeat(3),
            }
          : column,
      ),
      rows: [{ ...layoutInput.rows[0], note: longNote }],
    });
    const extra = Array.from({ length: 8 }, (_, index) => ({
      key: `extra${index}`,
      label: `扩展字段 ${index + 1}`,
    }));
    const many = await run({
      ...layoutInput,
      title: '多列表格评审',
      columns: [...layoutInput.columns, ...extra],
      rows: layoutInput.rows.map((row) => ({
        ...row,
        ...Object.fromEntries(extra.map((column) => [column.key, `${column.label} 原始内容`])),
      })),
    });
    const empty = await run({ ...layoutInput, title: '空数据评审', rows: [] });
    return { ...fixture, normal, long, many, empty };
  } catch (error) {
    await fixture.stop();
    throw error;
  }
}
