import { annotationTools } from './annotation-tools.mjs';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { startExplanationsFixture } from './explanations-fixture.mjs';

async function until(check, message) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await delay(50);
  }
  throw new Error(message);
}
const fixture = await startExplanationsFixture();
let browser;
try {
  browser = await chromium.launch({
    headless: true,
    channel: process.env.PANEON_TEST_BROWSER_CHANNEL ?? 'chrome',
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(fixture.url('concurrency'));
  const frame = page.frameLocator('iframe');
  const comments = annotationTools(frame, page);
  await frame.getByRole('heading', { name: '同时跑几个任务，会怎样影响完成时间？' }).waitFor();
  await comments.assertNoLegacySection();
  assert.equal(await frame.locator('[data-timeline]').count(), 2);
  assert.match(await frame.locator('[data-timeline="2"]').textContent(), /整批耗时 5 秒/);
  await frame.getByRole('button', { name: '播放', exact: true }).click();
  await until(
    async () => !(await frame.getByTestId('clock').textContent()).includes('0.0'),
    'playback advances',
  );
  await frame.getByRole('button', { name: '暂停', exact: true }).click();
  const paused = await frame.getByTestId('clock').textContent();
  await delay(350);
  assert.equal(await frame.getByTestId('clock').textContent(), paused);
  await frame.getByRole('button', { name: '重播', exact: true }).click();
  assert.match(await frame.getByTestId('clock').textContent(), /0.0/);
  for (const [c, total] of [
    [1, 10],
    [3, 4],
    [4, 4],
    [2, 5],
  ]) {
    await frame.getByLabel('并发上限（1–4）').fill(String(c));
    assert.match(
      await frame.locator('[data-timeline]').last().textContent(),
      new RegExp(`整批耗时 ${total} 秒`),
    );
    assert.match(await frame.getByTestId('clock').textContent(), /0.0/);
  }
  await frame.getByLabel('并发上限（1–4）').fill('5');
  await frame.getByRole('alert').waitFor();
  assert.match(await frame.locator('[data-timeline]').last().textContent(), /整批耗时 5 秒/);
  await frame.getByLabel('并发上限（1–4）').fill('2');
  await frame.getByRole('button', { name: '前进 1 秒', exact: true }).click();
  assert.equal(
    (await fixture.events('concurrency')).length,
    0,
    'navigation and exploration emit nothing',
  );
  await frame.getByRole('button', { name: '选择对象', exact: true }).click();
  const cTask = frame.locator('[data-timeline="2"] [data-task="c"]');
  await cTask.click();
  await comments.write('为什么任务 C 还在等待？');
  await comments.save();
  await frame.getByLabel('并发上限（1–4）').fill('4');
  await comments.locate(1, 1);
  assert.equal(await frame.getByLabel('并发上限（1–4）').inputValue(), '2');
  assert.match(await frame.getByTestId('clock').textContent(), /1.0/);
  const feedbackUrl = `**/api/panels/${fixture.panels.concurrency.instanceId}/events`;
  await page.route(feedbackUrl, (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: false,
        error: { code: 'TEST_REJECTED', message: 'Intentional test rejection' },
      }),
    }),
  );
  await frame.getByRole('button', { name: '提交批注', exact: true }).click();
  await frame.getByRole('alert').waitFor();
  assert.equal((await fixture.events('concurrency')).length, 0);
  assert.match(await comments.text(1), /为什么任务 C 还在等待/);
  await page.unroute(feedbackUrl);
  await frame.getByRole('button', { name: '提交批注', exact: true }).click();
  await until(async () => (await fixture.events('concurrency')).length === 1, 'feedback persisted');
  const event = (await fixture.events('concurrency'))[0];
  assert.equal(event.type, 'explanation-feedback');
  assert.deepEqual(event.payload.annotations[0].targets[0].ref, {
    kind: 'task',
    taskId: 'c',
    concurrency: 2,
    atMs: 1000,
  });
  assert.equal(event.payload.annotations[0].comment, '为什么任务 C 还在等待？');
  await comments.edit(1);
  await comments.write('');
  await comments.save();
  await frame.getByRole('button', { name: '提交批注', exact: true }).click();
  await until(
    async () => (await fixture.events('concurrency')).length === 2,
    'selection-only retained',
  );
  assert.equal((await fixture.events('concurrency'))[1].payload.annotations[0].comment, '');
  assert.equal('selected' in (await fixture.events('concurrency'))[1].payload, false);
  if (process.env.PANEON_TEST_ARTIFACTS) {
    await mkdir(process.env.PANEON_TEST_ARTIFACTS, { recursive: true });
    await frame.locator('[data-timeline]').first().scrollIntoViewIfNeeded();
    await page.screenshot({
      path: join(process.env.PANEON_TEST_ARTIFACTS, 'explanations-concurrency.png'),
      fullPage: true,
    });
  }
  await page.goto(fixture.url('sentinel-leap-array'));
  await frame.getByRole('heading', { name: '时间在前进，为什么只需要 4 个槽位？' }).waitFor();
  assert.equal(await frame.getByRole('img').isVisible(), true);
  const next = async () => frame.getByRole('button', { name: /下一步演示/ }).click();
  for (const total of [1, 2, 3, 4, 4, 2, 3, 3]) {
    await next();
    assert.equal(await frame.getByTestId('pass-total').textContent(), String(total));
  }
  assert.match(await frame.getByTestId('returned-bucket').textContent(), /独立桶/);
  assert.match(await frame.locator('[data-slot="0"]').textContent(), /2000, 2500.*PASS 1/);
  assert.match(await frame.locator('[data-slot="2"]').textContent(), /null/);
  assert.equal(await frame.getByTestId('stored-count').textContent(), '3');
  await frame.getByLabel('虚拟时间（整数 ms，可回拨）').fill('-1');
  await frame.getByRole('button', { name: '设置时间', exact: true }).click();
  await frame.getByRole('button', { name: '访问当前窗口', exact: true }).click();
  assert.equal(await frame.getByTestId('pass-total').textContent(), '0');
  assert.equal(await frame.getByTestId('returned-bucket').textContent(), '返回 null');
  await frame.getByRole('button', { name: '重新开始', exact: true }).click();
  await frame.getByRole('button', { name: '记录 1 个 PASS', exact: true }).click();
  await frame.getByRole('button', { name: '+2000ms', exact: true }).click();
  assert.equal(
    await frame.getByRole('button', { name: '自由探索中', exact: true }).isDisabled(),
    true,
  );
  assert.equal(
    await frame.getByTestId('pass-total').textContent(),
    '1',
    'exact boundary is retained without access',
  );
  await frame.getByRole('button', { name: '+100ms', exact: true }).click();
  assert.equal(
    await frame.getByTestId('pass-total').textContent(),
    '0',
    'expiration filters without clearing',
  );
  assert.match(await frame.locator('[data-slot="0"]').textContent(), /PASS 1/);
  await frame.getByRole('button', { name: '记录 1 个 PASS', exact: true }).click();
  assert.match(await frame.getByTestId('branch-message').textContent(), /重置/);
  assert.equal(await frame.getByTestId('pass-total').textContent(), '1');
  assert.equal((await fixture.events('sentinel-leap-array')).length, 0);
  const hrefs = await frame.locator('a').evaluateAll((links) => links.map((link) => link.href));
  assert.equal(hrefs.length, 5);
  assert.ok(
    hrefs.every((href) =>
      href.startsWith(
        'https://github.com/alibaba/Sentinel/blob/a3f40ba8e900c8489bd520274739f17235a7721c/',
      ),
    ),
  );
  if (process.env.PANEON_TEST_ARTIFACTS) {
    await frame.getByRole('img').scrollIntoViewIfNeeded();
    await page.screenshot({
      path: join(process.env.PANEON_TEST_ARTIFACTS, 'explanations-sentinel.png'),
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await frame.getByRole('img').isVisible(), true);
  const iframe = page.frames().find((item) => item.url().endsWith('/frame.html'));
  assert.ok(iframe);
  assert.equal(
    await iframe.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    true,
    'mobile layout must not overflow horizontally',
  );
  const cli = async (...args) => {
    const { stdout } = await promisify(execFile)(
      process.execPath,
      [
        process.env.PANEON_TEST_CLI_ENTRY ??
          new URL('../../dist/cli/index.js', import.meta.url).pathname,
        'panel',
        ...args,
        '--json',
      ],
      { env: { ...process.env, HOME: fixture.root }, cwd: fixture.root },
    );
    const result = JSON.parse(stdout);
    assert.equal(result.ok, true);
    return result.data;
  };
  const read = await cli(
    'events',
    fixture.panels.concurrency.instanceId,
    '--consumer',
    'explanation-cli',
    '--wait-ms',
    '0',
  );
  assert.equal(read.events.length, 2);
  await cli(
    'ack',
    fixture.panels.concurrency.instanceId,
    '--consumer',
    'explanation-cli',
    '--through',
    String(read.events[1].id),
  );
  assert.equal(
    (
      await cli(
        'events',
        fixture.panels.concurrency.instanceId,
        '--consumer',
        'explanation-cli',
        '--wait-ms',
        '0',
      )
    ).events.length,
    0,
  );
  assert.deepEqual(errors, []);
  console.log(
    'Chrome: copied examples render; deterministic parallel timelines, playback/pause/replay, parameter reset, feedback snapshots + empty annotations + CLI events/ack; Sentinel ring/story, strict expiration, lazy reset, rollback, sources and mobile layout pass.',
  );
} finally {
  await browser?.close();
  await fixture.stop();
}
