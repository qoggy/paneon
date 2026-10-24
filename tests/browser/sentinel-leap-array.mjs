import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { startExplanationsFixture } from './explanations-fixture.mjs';

export async function verifySentinel(page, fixture) {
  await page.goto(fixture.url('sentinel-leap-array'));
  const f = page.frameLocator('iframe');
  await f.getByRole('heading', { name: '请求来了，LeapArray 怎么处理？' }).waitFor();
  const slider = f.getByRole('slider', { name: '模拟时间轴' });
  // Native range input events exercise the same seek path as pointer/keyboard movement.
  const seek = async (value) => {
    await slider.fill(String(value));
    await assert.equal(await slider.inputValue(), String(value));
  };
  assert.equal(await f.getByTestId('passed-total').textContent(), '0');
  await seek(100);
  assert.equal(await f.getByTestId('passed-total').textContent(), '5');
  assert.equal(await f.getByTestId('blocked-total').textContent(), '1');
  assert.match(await f.getByTestId('decision').textContent(), /floor\(5\) \+ 1 > 5/);
  assert.match(await f.locator('[data-slot="0"]').textContent(), /PASS 5.*BLOCK 1/);
  await f.getByText('请求记录', { exact: true }).click();
  await f.getByRole('button', { name: '查看请求 1', exact: true }).click();
  assert.equal(await f.getByTestId('passed-total').textContent(), '1');
  assert.match(await f.getByTestId('branch-message').textContent(), /创建/);
  await f.getByText('请求记录', { exact: true }).click();
  await seek(1200);
  assert.equal(await f.getByTestId('passed-total').textContent(), '6');
  assert.equal(await f.getByTestId('blocked-total').textContent(), '3');
  assert.match(await f.getByTestId('branch-message').textContent(), /旧计数清零/);
  assert.match(await f.locator('[data-slot="0"]').textContent(), /1000–1250ms.*PASS 1/);
  await seek(100);
  assert.equal(await f.getByTestId('passed-total').textContent(), '5');
  assert.match(await f.locator('[data-slot="0"]').textContent(), /0–250ms.*PASS 5/);

  // Real pointer drag and keyboard range navigation, including automatic pause on seek.
  const bounds = await slider.boundingBox();
  assert.ok(bounds);
  await page.mouse.move(bounds.x + bounds.width * 0.2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * 0.55, bounds.y + bounds.height / 2, { steps: 8 });
  await page.mouse.up();
  assert.ok(Number(await slider.inputValue()) > 900);
  await slider.press('Home');
  assert.equal(await f.getByTestId('passed-total').textContent(), '0');
  await f.getByRole('button', { name: '播放', exact: true }).click();
  await f.getByRole('button', { name: '暂停', exact: true }).waitFor();
  await delay(250);
  await f.getByRole('button', { name: '暂停', exact: true }).click();
  const paused = await slider.inputValue();
  await delay(200);
  assert.equal(await slider.inputValue(), paused);
  await f.getByRole('button', { name: '播放', exact: true }).click();
  await slider.press('End');
  await f.getByRole('button', { name: '播放', exact: true }).waitFor();
  assert.equal(await f.getByTestId('current-qps').textContent(), '0');
  assert.match(await f.locator('[data-slot="0"]').textContent(), /PASS 1.*已过期/);
  await f.getByRole('button', { name: '重新开始', exact: true }).click();
  assert.equal(await slider.inputValue(), '-1');
  assert.equal(await f.getByTestId('passed-total').textContent(), '0');
  assert.match(await f.locator('[data-slot="0"]').textContent(), /空/);

  // Draft edits are explicit: invalid config never replaces the running scenario.
  await f.getByLabel('限流 QPS', { exact: true }).fill('0');
  await f.getByRole('button', { name: '应用并重新开始', exact: true }).click();
  await f.getByRole('alert').waitFor();
  await seek(100);
  assert.equal(await f.getByTestId('passed-total').textContent(), '5');
  await f.getByLabel('限流 QPS', { exact: true }).fill('2');
  await f.getByRole('button', { name: '应用并重新开始', exact: true }).click();
  await seek(100);
  assert.equal(await f.getByTestId('passed-total').textContent(), '2');
  assert.equal(await f.getByTestId('blocked-total').textContent(), '4');
  await f.getByText('窗口设置', { exact: true }).click();
  await f.getByLabel('统计时长（ms）', { exact: true }).fill('2000');
  await f.getByLabel('槽位数', { exact: true }).fill('4');
  await f.getByRole('button', { name: '应用并重新开始', exact: true }).click();
  await seek(100);
  assert.equal(await f.getByTestId('passed-total').textContent(), '4');
  assert.equal(await f.getByTestId('current-qps').textContent(), '2');
  await f.getByLabel('槽位数', { exact: true }).fill('3');
  await f.getByRole('button', { name: '应用并重新开始', exact: true }).click();
  assert.match(await f.getByRole('alert').textContent(), /整除/);
  await f.getByLabel('槽位数', { exact: true }).fill('4');
  await f.getByLabel('统计时长（ms）', { exact: true }).fill('1000');
  await f.getByLabel('限流 QPS', { exact: true }).fill('5');
  await f.getByText('窗口设置', { exact: true }).click();

  // Add/remove/edit requests and idle preset reproduce sparse storage and expiration.
  await f.getByRole('button', { name: '空闲后请求', exact: true }).click();
  await f.getByRole('button', { name: '添加请求', exact: true }).click();
  assert.equal(await f.locator('[data-request-row]').count(), 4);
  await f.getByLabel('到达时间（ms） 4', { exact: true }).fill('2600');
  await f.getByLabel('请求数 4', { exact: true }).fill('1');
  await f.getByRole('button', { name: '删除此行 4', exact: true }).click();
  await f.getByRole('button', { name: '应用并重新开始', exact: true }).click();
  await seek(1000);
  assert.equal(await f.getByTestId('current-qps').textContent(), '3');
  await seek(1001);
  assert.equal(await f.getByTestId('current-qps').textContent(), '1');
  await seek(2500);
  assert.equal(await f.getByTestId('current-qps').textContent(), '2');
  assert.match(await f.locator('[data-slot="3"]').textContent(), /空/);
  assert.match(await f.locator('[data-slot="0"]').textContent(), /PASS 2.*已过期/);
  await f.getByRole('button', { name: '瞬间突发', exact: true }).click();
  await f.getByRole('button', { name: '应用并重新开始', exact: true }).click();
  await seek(1200);
  const iframe = page.frames().find((item) => item.url().endsWith('/frame.html'));
  assert.ok(iframe);
  assert.equal(
    await iframe.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    true,
  );
  if (process.env.PANEON_TEST_ARTIFACTS) {
    await mkdir(process.env.PANEON_TEST_ARTIFACTS, { recursive: true });
    await page.screenshot({
      path: join(process.env.PANEON_TEST_ARTIFACTS, 'sentinel-requests.png'),
      fullPage: true,
    });
  }
  assert.equal((await fixture.events('sentinel-leap-array')).length, 0);
}

export async function verifyPlaybackFrameTiming(page, fixture) {
  await page.goto(fixture.url('sentinel-leap-array'));
  const f = page.frameLocator('iframe');
  await f.getByRole('heading', { name: '请求来了，LeapArray 怎么处理？' }).waitFor();
  const frame = page.frames().find((item) => item.url().endsWith('/frame.html'));
  assert.ok(frame);
  // rAF timestamps describe a frame, not the instant this callback was registered.
  // Reproduce a first frame timestamp 2ms before registration (observed with native rAF).
  await frame.evaluate(() => {
    const native = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) => {
      const registeredAt = performance.now();
      return native(() => callback(registeredAt - 2));
    };
  });
  const slider = f.getByRole('slider', { name: '模拟时间轴' });
  for (let i = 0; i < 20; i++) {
    await f.getByRole('button', { name: '播放', exact: true }).click();
    await delay(60);
    assert.equal(
      await f.getByRole('heading', { name: '请求来了，LeapArray 怎么处理？' }).isVisible(),
      true,
      `play ${i + 1} must not unmount the page`,
    );
    await f.getByRole('button', { name: '暂停', exact: true }).click({ timeout: 2000 });
    const paused = await slider.inputValue();
    assert.ok(Number(paused) >= -1);
    await delay(40);
    assert.equal(await slider.inputValue(), paused, 'paused callbacks must be cancelled');
    await f.getByRole('button', { name: '重新开始', exact: true }).click();
    assert.equal(await slider.inputValue(), '-1');
  }
  await f.getByRole('button', { name: '播放', exact: true }).click();
  await slider.press('End');
  await f.getByRole('button', { name: '播放', exact: true }).waitFor();
  await f.getByRole('button', { name: '播放', exact: true }).click();
  await f.getByRole('button', { name: '播放', exact: true }).waitFor({ timeout: 6000 });
  assert.equal(
    Number(await slider.inputValue()),
    Number(await slider.getAttribute('max')),
    'natural completion stops exactly at the end',
  );
  assert.equal(await f.getByTestId('passed-total').textContent(), '6');
  assert.equal(await f.getByTestId('blocked-total').textContent(), '3');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const fixture = await startExplanationsFixture(['sentinel-leap-array']);
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      channel: process.env.PANEON_TEST_BROWSER_CHANNEL ?? 'chrome',
    });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await verifySentinel(page, fixture);
    await verifyPlaybackFrameTiming(page, fixture);
    // One desktop dark/English check covers this page's copy and theme wiring.
    await fixture.service.app.inject({
      method: 'POST',
      url: '/api/preferences',
      headers: {
        host: `127.0.0.1:${fixture.service.descriptor.port}`,
        authorization: `Bearer ${fixture.service.descriptor.controlToken}`,
      },
      payload: { ui: { language: 'en', theme: 'dark' } },
    });
    await page.reload();
    const f = page.frameLocator('iframe');
    await f.getByRole('heading', { name: 'Watch requests move through LeapArray' }).waitFor();
    await f.getByLabel('QPS limit', { exact: true }).fill('3');
    await f.getByRole('button', { name: 'Apply & restart' }).click();
    await f.getByRole('slider', { name: 'Simulation time' }).fill('100');
    assert.equal(await f.getByTestId('passed-total').textContent(), '3');
    assert.equal(await f.getByTestId('blocked-total').textContent(), '3');
    const frame = page.frames().find((item) => item.url().endsWith('/frame.html'));
    assert.equal(
      await frame.evaluate(() => document.documentElement.classList.contains('dark')),
      true,
    );
    if (process.env.PANEON_TEST_ARTIFACTS)
      await page.screenshot({
        path: join(process.env.PANEON_TEST_ARTIFACTS, 'sentinel-dark-en.png'),
        fullPage: true,
      });
    assert.deepEqual(errors, []);
    console.log(
      'Desktop Chrome: editable requests/QPS/window settings; sequential rejection, exact expiration, immutable seek, pointer drag, keyboard seek, play/pause/restart, per-request inspection, validation, light/Chinese + dark/English passed.',
    );
  } finally {
    await browser?.close();
    await fixture.stop();
  }
}
