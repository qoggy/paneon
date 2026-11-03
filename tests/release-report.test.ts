import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, realpathSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  formatReleaseReport,
  formatReleaseDuration,
  releaseResultFailed,
} from './release-report.ts';
import type { ReleaseResult, UnitReport } from './release-report.ts';

const result = (phase: string, name: string, code = 0, milliseconds = 1000): ReleaseResult => ({
  phase,
  name,
  code,
  milliseconds,
});

void test('release summary shows case counts, cancellations and parallel wall time without mixing units', () => {
  const unit = result('unit', 'node-tests', 1, 394640);
  unit.unit = {
    counts: { tests: 458, passed: 452, failed: 2, cancelled: 4, skipped: 0, todo: 0 },
    failures: [
      {
        name: 'source recovery',
        file: '/repo/tests/source.test.ts',
        line: 12,
        message: 'timed out',
      },
    ],
  };
  const browser = [result('browser', 'first', 0, 10000), result('browser', 'second', 1, 10000)];
  browser[1].failureMessage = 'Error: history did not extend';
  const results = [
    result('build', 'build', 0, 16369),
    result('prepare', 'bundled-version-preflight', 0, 358),
    unit,
    ...browser,
    result('prepare', 'package-baseline', 0, 5000),
    result('package', 'installed'),
  ];
  const report = formatReleaseReport({
    results,
    commands: [unit, ...browser, results.at(-1) as ReleaseResult],
    phaseTimings: [
      { phase: 'unit', milliseconds: 394643 },
      { phase: 'browser', milliseconds: 12000 },
      { phase: 'package', milliseconds: 6000 },
    ],
    wallMilliseconds: 2021000,
    repository: '/repo',
  });
  assert.match(report, /测试结果：失败\s+总耗时：33 分 41 秒/);
  assert.match(report, /单元测试\s*\| 452 通过、2 失败、4 取消\s*\| 6 分 35 秒/);
  assert.match(report, /浏览器测试\s*\| 1 通过、1 失败\s*\| 12 秒/);
  assert.match(report, /打包测试\s*\| 1 项通过\s*\| 6 秒/);
  assert.match(report, /tests\/source.test.ts:12 — source recovery/);
  assert.match(report, /second — Error: history did not extend/);
  assert.ok(report.indexOf('未通过明细') < report.indexOf('| 阶段'));
  unit.code = 0;
  assert.equal(
    releaseResultFailed(unit),
    true,
    'Case failures must not be hidden by a zero exit code',
  );
  assert.doesNotMatch(report, /退出码 1.*node-tests/);
});

void test('build and package preparation failures leave unstarted tests visible', () => {
  const commands = [
    result('checks', 'lint'),
    result('unit', 'node-tests'),
    result('package', 'installed'),
  ];
  const build = formatReleaseReport({
    results: [result('build', 'build', 1)],
    commands,
    phaseTimings: [],
    wallMilliseconds: 1000,
  });
  assert.match(build, /构建\s*\| 失败/);
  assert.match(build, /单元测试\s*\| 未运行\s*\|/);
  assert.doesNotMatch(build, /测试结果：通过/);
  const packing = formatReleaseReport({
    results: [result('prepare', 'package-baseline', 1)],
    commands: commands.slice(-1),
    phaseTimings: [{ phase: 'package', milliseconds: 3000 }],
    wallMilliseconds: 3000,
    skipBuild: true,
  });
  assert.match(packing, /安装准备失败（1 项未运行）/);
  assert.match(packing, /package-baseline/);
});

void test('interruption, missing Node counts, cleanup failure and skipped cases cannot appear as all passed', () => {
  const unit = result('unit', 'node-tests', 1);
  const report = formatReleaseReport({
    results: [unit, result('cleanup', 'stop', 1)],
    commands: [unit],
    phaseTimings: [],
    wallMilliseconds: 1000,
    skipBuild: true,
    interrupted: true,
  });
  assert.match(report, /测试结果：已中断/);
  assert.match(report, /无用例统计/);
  assert.match(report, /清理\s*\| 失败/);
  assert.doesNotMatch(report, /测试结果：通过/);
  unit.code = 0;
  unit.unit = {
    counts: { tests: 3, passed: 1, failed: 0, cancelled: 0, skipped: 1, todo: 1 },
    failures: [],
  };
  const passed = formatReleaseReport({
    results: [unit],
    commands: [unit],
    phaseTimings: [],
    wallMilliseconds: 1000,
  });
  assert.match(passed, /测试结果：通过/);
  assert.match(passed, /1 通过、0 失败、1 跳过、1 待办/);
  assert.match(
    formatReleaseReport({
      results: [],
      commands: [unit],
      phaseTimings: [],
      wallMilliseconds: 0,
      error: 'fixture setup failed',
    }),
    /运行器异常：fixture setup failed/,
  );
});

void test('Node reporter obtains real pass/fail/cancel/skip/todo counts and leaf failures from test events', () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'paneon-release-reporter-')));
  try {
    const file = join(root, 'fixture.test.mjs');
    writeFileSync(
      file,
      `
import {test,describe} from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
describe('suite',()=>{
  test('passed',()=>assert.equal(1,1));
  test('failed',()=>assert.equal(1,2));
  test('cancelled',{timeout:10},async()=>{await delay(100);});
  test.skip('skipped',()=>{});
  test.todo('planned');
});
`,
    );
    const second = join(root, 'second.test.mjs');
    writeFileSync(second, "import {test} from 'node:test';test('another pass',()=>{});\n");
    const metadata = join(root, 'unit.json');
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    const child = spawnSync(
      process.execPath,
      [
        '--test-reporter=spec',
        '--test-reporter-destination=stdout',
        `--test-reporter=${new URL('./release-node-reporter.mjs', import.meta.url).href}`,
        `--test-reporter-destination=${metadata}`,
        '--test',
        file,
        second,
      ],
      {
        encoding: 'utf8',
        timeout: 10000,
        cwd: fileURLToPath(new URL('../', import.meta.url)),
        env,
      },
    );
    assert.equal(child.status, 1, child.stderr);
    assert.match(child.stdout, /another pass/);
    const report = JSON.parse(readFileSync(metadata, 'utf8')) as UnitReport;
    assert.ok(report.counts);
    assert.equal(report.counts.tests, 6);
    assert.deepEqual(
      {
        passed: report.counts.passed,
        failed: report.counts.failed,
        cancelled: report.counts.cancelled,
        skipped: report.counts.skipped,
        todo: report.counts.todo,
      },
      { passed: 2, failed: 1, cancelled: 1, skipped: 1, todo: 1 },
    );
    assert.deepEqual(
      report.failures.map((failure) => failure.name),
      ['failed', 'cancelled'],
    );
    assert.ok(
      report.failures.every((failure) => failure.file === file && failure.line),
      JSON.stringify(report.failures.map(({ file, line }) => ({ file, line }))),
    );
    assert.match(report.failures[0].details ?? '', /ERR_ASSERTION/);
    const success = spawnSync(
      process.execPath,
      [
        '--test',
        `--test-reporter=${new URL('./release-node-reporter.mjs', import.meta.url).href}`,
        second,
      ],
      { encoding: 'utf8', timeout: 10000, env },
    );
    assert.equal(success.status, 0, success.stderr);
    const successReport = JSON.parse(success.stdout) as UnitReport;
    assert.equal(successReport.counts?.passed, 1);
    assert.deepEqual(successReport.failures, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

void test('release durations retain readable seconds, minutes and hours', () => {
  assert.equal(formatReleaseDuration(17_463), '17 秒');
  assert.equal(formatReleaseDuration(169_392), '2 分 49 秒');
  assert.equal(formatReleaseDuration(3_661_000), '1 小时 1 分 1 秒');
});
