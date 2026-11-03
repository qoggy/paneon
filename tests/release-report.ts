import { relative } from 'node:path';

export type UnitReport = {
  counts: {
    tests: number;
    passed: number;
    failed: number;
    cancelled: number;
    skipped: number;
    todo: number;
  } | null;
  failures: { name: string; file?: string; line?: number; message: string; details?: string }[];
};

export type ReleaseResult = {
  phase: string;
  name: string;
  code: number;
  milliseconds: number;
  signal?: string | null;
  error?: string;
  failureMessage?: string;
  unit?: UnitReport;
};

export function releaseResultFailed(result: ReleaseResult) {
  const counts = result.unit?.counts;
  return (
    result.code !== 0 ||
    Boolean(result.error) ||
    Boolean(counts && (counts.failed || counts.cancelled))
  );
}

const phaseNames: Record<string, string> = {
  build: '构建',
  prepare: '准备检查',
  checks: '静态检查',
  unit: '单元测试',
  acceptance: '验收测试',
  browser: '浏览器测试',
  package: '打包测试',
  live: '真实 GitHub 测试',
  cleanup: '清理',
};

export const releasePhaseName = (phase: string) => phaseNames[phase] ?? phase;

export function formatReleaseDuration(milliseconds: number) {
  const seconds = Math.round(milliseconds / 1000);
  if (milliseconds > 0 && seconds === 0) return '不足 1 秒';
  if (seconds < 60) return `${seconds} 秒`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
  return `${Math.floor(seconds / 3600)} 小时 ${Math.floor((seconds % 3600) / 60)} 分 ${seconds % 60} 秒`;
}

export function formatUnitCounts(counts: NonNullable<UnitReport['counts']>) {
  return [
    `${counts.passed} 通过`,
    `${counts.failed} 失败`,
    ...(counts.cancelled ? [`${counts.cancelled} 取消`] : []),
    ...(counts.skipped ? [`${counts.skipped} 跳过`] : []),
    ...(counts.todo ? [`${counts.todo} 待办`] : []),
  ].join('、');
}

function table(rows: string[][]) {
  // These cells contain Chinese labels, numbers and ASCII; CJK cells occupy two columns.
  const width = (value: string) =>
    [...value].reduce((n, char) => n + (char.charCodeAt(0) > 127 ? 2 : 1), 0);
  const widths = rows[0].map((_, column) => Math.max(...rows.map((row) => width(row[column]))));
  const render = (row: string[]) =>
    '| ' + row.map((cell, i) => cell + ' '.repeat(widths[i] - width(cell))).join(' | ') + ' |';
  return [
    render(rows[0]),
    '| ' + widths.map((n) => '-'.repeat(n)).join(' | ') + ' |',
    ...rows.slice(1).map(render),
  ].join('\n');
}

export function formatReleaseReport({
  results,
  commands,
  phaseTimings,
  wallMilliseconds,
  skipBuild = false,
  interrupted = false,
  error,
  repository = process.cwd(),
}: {
  results: ReleaseResult[];
  commands: { phase: string; name: string }[];
  phaseTimings: { phase: string; milliseconds: number }[];
  wallMilliseconds: number;
  skipBuild?: boolean;
  interrupted?: boolean;
  error?: string;
  repository?: string;
}) {
  const failed = results.some(releaseResultFailed);
  const expected = commands.length;
  const completed = commands.filter((command) =>
    results.some((result) => result.phase === command.phase && result.name === command.name),
  ).length;
  const status = interrupted
    ? '已中断'
    : failed || error || completed !== expected
      ? '失败'
      : '通过';
  const rows = [['阶段', '结果', '耗时']];
  const build = results.filter(
    (result) => result.phase === 'build' || result.name === 'bundled-version-preflight',
  );
  const buildFailure = build.find((result) => result.code !== 0);
  rows.push([
    phaseNames.build,
    buildFailure
      ? buildFailure.name === 'bundled-version-preflight'
        ? '版本预检失败'
        : '失败'
      : skipBuild
        ? `跳过构建${build.length ? '，版本预检通过' : ''}`
        : build.length
          ? '通过'
          : '未运行',
    build.length
      ? formatReleaseDuration(build.reduce((sum, result) => sum + result.milliseconds, 0))
      : '-',
  ]);
  for (const phase of ['checks', 'unit', 'acceptance', 'browser', 'package', 'live']) {
    const selected = commands.filter((command) => command.phase === phase);
    if (!selected.length) continue;
    const group = results.filter((result) => result.phase === phase);
    const pending = selected.length - group.length;
    const preparation = results.find((result) => result.name === 'package-baseline');
    let outcome: string;
    if (phase === 'unit' && group.length) {
      const result = group[0];
      outcome = result.unit?.counts
        ? formatUnitCounts(result.unit.counts)
        : `进程${result.code === 0 ? '通过' : '失败'}（无用例统计）`;
      if (
        result.code !== 0 &&
        result.unit?.counts &&
        !result.unit.counts.failed &&
        !result.unit.counts.cancelled
      )
        outcome += '，进程异常退出';
    } else if (group.length) {
      const passed = group.filter((result) => result.code === 0).length;
      const failures = group.length - passed;
      outcome = failures ? `${passed} 通过、${failures} 失败` : `${passed} 项通过`;
    } else {
      outcome = '未运行';
    }
    if (pending && group.length) outcome += `、${pending} 项未运行`;
    if (phase === 'package' && preparation?.code !== undefined && preparation.code !== 0)
      outcome = `安装准备失败（${selected.length} 项未运行）`;
    const timing = phaseTimings.find((timing) => timing.phase === phase);
    rows.push([
      releasePhaseName(phase),
      outcome,
      timing ? formatReleaseDuration(timing.milliseconds) : '-',
    ]);
  }
  const cleanup = results.filter((result) => result.phase === 'cleanup');
  if (cleanup.length)
    rows.push([
      phaseNames.cleanup,
      cleanup.some((result) => result.code !== 0) ? '失败' : '通过',
      formatReleaseDuration(cleanup.reduce((sum, result) => sum + result.milliseconds, 0)),
    ]);
  const lines: string[] = [];
  const failures: string[] = [];
  for (const result of results) {
    if (!releaseResultFailed(result)) continue;
    if (result.unit?.failures.length) {
      for (const failure of result.unit.failures) {
        const location = failure.file
          ? `${relative(repository, failure.file)}${failure.line ? `:${failure.line}` : ''}`
          : result.name;
        failures.push(
          `[${releasePhaseName(result.phase)}] ${location} — ${failure.name}\n   ${failure.message}`,
        );
      }
    } else {
      const detail =
        result.error ??
        result.failureMessage ??
        (result.signal ? `信号 ${result.signal}` : `退出码 ${result.code}`);
      failures.push(`[${releasePhaseName(result.phase)}] ${result.name} — ${detail}`);
    }
  }
  if (error) failures.push(`运行器异常：${error}`);
  if (failures.length) {
    lines.push('', `未通过明细（${failures.length} 项）：`);
    failures.forEach((failure, i) => lines.push(`${i + 1}. ${failure}`));
  }
  // Put the table last: even many failure details cannot scroll it out of view.
  lines.push(
    '',
    `测试结果：${status}    总耗时：${formatReleaseDuration(wallMilliseconds)}`,
    '',
    table(rows),
    '',
    '计数：单元测试按用例，其余阶段按检查项/测试脚本；并行阶段使用实际耗时。',
    '构建耗时含版本预检，打包耗时含安装准备。',
  );
  if (!commands.some((command) => command.phase === 'live'))
    lines.push('本次不含真实 GitHub 测试（单独执行 --phase=live）。');
  if (interrupted) lines.push('', '测试已中断，未完成的项目不计为通过。');
  return lines.join('\n');
}
