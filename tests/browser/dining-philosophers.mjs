import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { startExplanationsFixture } from './explanations-fixture.mjs';
import { submitAnnotations } from './annotation-tools.mjs';
import { simulationTrace } from '#test-skill/assets/examples/dining-philosophers/model.ts';

export async function verifyDiningPhilosophers(page, fixture) {
  await page.goto(fixture.url('dining-philosophers'));
  const frame = page.frameLocator('iframe');
  const step = async () =>
    Number((await frame.getByTestId('step-counter').textContent()).split('/')[0].trim());
  const button = (name) => frame.getByRole('button', { name, exact: true });
  const seek = async (index) => {
    await frame.getByRole('slider', { name: '模拟时间线' }).focus();
    await page.keyboard.press('Home');
    for (let i = 0; i < index; i++) await page.keyboard.press('ArrowRight');
  };
  const screenshot = async (name) => {
    if (!process.env.PANEON_TEST_ARTIFACTS) return;
    await mkdir(process.env.PANEON_TEST_ARTIFACTS, { recursive: true });
    await delay(100); // Let the iframe composite its latest instruction state.
    await page.screenshot({
      path: join(process.env.PANEON_TEST_ARTIFACTS, name),
      fullPage: true,
      animations: 'disabled',
    });
  };
  await frame.getByRole('heading', { name: '哲学家就餐', exact: true }).waitFor();
  await assertNoDraft(frame);
  assert.equal(await frame.locator('[data-philosopher]').count(), 5);
  assert.equal(await frame.locator('[data-fork]').count(), 5);
  assert.equal(await frame.locator('[data-next-edge]').count(), 0);
  assert.equal(await frame.locator('[data-instruction]').count(), 6);
  assert.match(
    await frame.locator('[data-instruction][data-active="true"]').textContent(),
    /enter\(table\)/,
  );
  await button('下一步').click();
  assert.equal(await step(), 1);
  assert.equal(await frame.locator('[data-philosopher="0"]').getAttribute('data-pc'), '1');
  assert.equal(await frame.locator('[data-fork="0"]').getAttribute('data-owner'), 'free');
  assert.match(
    await frame.locator('[data-instruction][data-executed="true"]').textContent(),
    /enter\(table\)/,
  );
  assert.match(
    await frame.locator('[data-instruction][data-active="true"]').textContent(),
    /take\(left\)/,
  );
  assert.equal(await frame.locator('[data-next-edge="0"]').getAttribute('data-next-fork'), '0');
  assert.equal(
    await frame.locator('[data-next-edge="0"]').getAttribute('data-edge-state'),
    'planned',
  );
  await assertResourceArrows(frame);
  await button('上一步').click();
  assert.equal(await step(), 0);
  await page.clock.install({ time: new Date('2026-10-24T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-24T00:00:01Z'));
  await button('播放').click();
  await button('暂停').waitFor();
  await page.clock.runFor(999);
  assert.equal(await step(), 0);
  await page.clock.runFor(1);
  assert.equal(await step(), 1);
  await button('暂停').click();
  await page.clock.runFor(2000);
  assert.equal(await step(), 1);
  await page.clock.resume();
  await button('重置').click();
  await seek(10);
  await frame.locator('[data-philosopher="4"]').click();
  assert.match(
    await frame.getByTestId('step-description').textContent(),
    /P4.*take\(left\).*拿起 F4/,
  );
  assert.equal(await frame.locator('[data-fork="4"]').getAttribute('data-owner'), '4');
  assert.equal(await frame.locator('[data-next-edge][data-edge-state="planned"]').count(), 5);
  assert.match(
    await frame.locator('[data-instruction][data-active="true"]').textContent(),
    /take\(right\)/,
  );
  assert.match(
    await frame.locator('[data-instruction][data-executed="true"]').textContent(),
    /take\(left\)/,
  );
  const destination = await frame
    .locator('[data-next-edge="4"]')
    .evaluate((line) => [
      line.getAttribute('x2'),
      line.getAttribute('y2'),
      line.getAttribute('data-next-fork'),
    ]);
  await assertResourceArrows(frame);
  await screenshot('dining-next-right.png');
  await button('下一步').click();
  assert.equal(await frame.locator('[data-next-edge][data-edge-state="blocked"]').count(), 1);
  assert.equal(await frame.locator('[data-next-edge][data-edge-state="planned"]').count(), 4);
  assert.equal(await frame.locator('[data-philosopher="0"]').getAttribute('data-pc'), '2');
  await frame.locator('[data-philosopher="0"]').click();
  assert.match(
    await frame.locator('[data-instruction][data-blocked="true"]').textContent(),
    /take\(right\)/,
  );
  await screenshot('dining-blocked-right.png');
  await button('复现死锁').click();
  assert.equal(await step(), 15);
  assert.match(await frame.getByTestId('simulation-status').textContent(), /发生死锁/);
  assert.equal(await frame.locator('[data-next-edge][data-edge-state="deadlock"]').count(), 5);
  assert.deepEqual(
    await frame
      .locator('[data-next-edge="4"]')
      .evaluate((line) => [
        line.getAttribute('x2'),
        line.getAttribute('y2'),
        line.getAttribute('data-next-fork'),
      ]),
    destination,
    'deadlock recolors the same resource arrow without changing its target',
  );
  await assertResourceArrows(frame);
  await screenshot('dining-deadlock.png');
  await button('上一步').click();
  assert.equal(await frame.locator('[data-next-edge][data-edge-state="deadlock"]').count(), 0);
  assert.equal(
    await frame.locator('[data-next-edge="4"]').getAttribute('data-edge-state'),
    'planned',
  );
  await button('下一步').click();
  await frame.locator('[data-philosopher="2"]').click();
  const details = frame.getByTestId('philosopher-details');
  assert.match(await details.textContent(), /P2.*等待中.*持有 F2.*等待 F3/);
  await details.locator('p').evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = document.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });
  await assertNoDraft(frame);
  for (const strategy of ['serial', 'ordered']) {
    await frame
      .getByRole('radio', { name: strategy === 'serial' ? '依次就餐' : '按编号取叉', exact: true })
      .click();
    assert.equal(await step(), 0);
    assert.equal(await frame.locator('[data-instruction]').count(), 6);
    const trace = simulationTrace(strategy);
    const eatingStep = trace.findIndex((snapshot) =>
      snapshot.philosophers.some((person) => person.phase === 'eating'),
    );
    await seek(eatingStep);
    const diner = trace[eatingStep].philosophers.findIndex((person) => person.phase === 'eating');
    await frame.locator(`[data-philosopher="${diner}"]`).click();
    assert.match(
      await frame.locator('[data-instruction][data-active="true"]').textContent(),
      /put\(left\); put\(right\)/,
    );
    assert.match(
      await frame.locator('[data-instruction][data-executed="true"]').textContent(),
      /eat\(\)/,
    );
    await assertOwnershipOutside(frame);
    await assertResourceArrows(frame);
    if (strategy === 'serial') {
      assert.match(await frame.getByTestId('dining-permit').textContent(), /P0 占用/);
      await page.setViewportSize({ width: 900, height: 1000 });
      await assertOwnershipOutside(frame);
      await page.setViewportSize({ width: 1440, height: 1000 });
      await assertOwnershipOutside(frame);
      const putStep = trace.findIndex(
        (snapshot) =>
          snapshot.action.kind === 'execute' &&
          snapshot.action.philosopher === 0 &&
          snapshot.action.line === 4,
      );
      await seek(putStep);
      assert.equal(await frame.locator('[data-fork][data-owner="free"]').count(), 5);
      assert.match(await frame.getByTestId('dining-permit').textContent(), /P0 占用/);
      assert.match(
        await frame.locator('[data-instruction][data-active="true"]').textContent(),
        /leave\(table\)/,
      );
      await screenshot('dining-before-leave.png');
      await button('下一步').click();
      assert.match(await frame.getByTestId('dining-permit').textContent(), /空闲/);
    } else await screenshot('dining-ordered-eat.png');
    await seek(trace.length - 1);
    assert.match(await frame.getByTestId('simulation-status').textContent(), /全部吃完/);
    assert.equal(await frame.locator('[data-philosopher][data-pc="6"]').count(), 5);
    assert.equal(await frame.locator('[data-next-edge]').count(), 0);
    assert.equal(await frame.locator('[data-fork][data-owner="free"]').count(), 5);
  }
  await assertNoDraft(frame);
  assert.equal((await fixture.events('dining-philosophers')).length, 0);
  await annotateForks(page, fixture);
}
// Picking the fork diagram delivers an excerpt that names the strategy and step it showed.
// A fresh page keeps this independent of the fake clock installed above.
async function annotateForks(previous, fixture) {
  const page = await previous
    .context()
    .browser()
    .newPage({ viewport: { width: 1440, height: 1100 } });
  try {
    await page.goto(fixture.url('dining-philosophers'));
    const frame = page.frameLocator('iframe');
    await frame.getByRole('heading', { name: '哲学家就餐', exact: true }).waitFor();
    await frame.getByRole('button', { name: '下一步', exact: true }).click();
    await frame.getByRole('button', { name: /^(Select content to annotate|选取批注)$/ }).click();
    await frame.locator('[data-element-annotation-picker="pick"]').waitFor();
    await frame.getByRole('img', { name: /叉子$/ }).click({ position: { x: 4, y: 4 } });
    await frame.locator('[data-element-annotation-picker="review"]').waitFor();
    await page.keyboard.press('Enter');
    const editor = frame.locator('[data-annotation-editor]');
    await editor.locator('textarea').fill('为什么先拿左叉会死锁？');
    await editor.locator('textarea').press('Enter');
    await editor.waitFor({ state: 'hidden' });
    await submitAnnotations(frame);
    const events = await fixture.events('dining-philosophers');
    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'annotations-submitted');
    const [annotation] = events[0].payload.annotations;
    assert.equal(annotation.comment, '为什么先拿左叉会死锁？');
    assert.deepEqual(annotation.targets.length, 1);
    const { element } = annotation.targets[0].ref;
    assert.equal(element.tag, 'svg');
    assert.equal(element.excerpt, '先拿左叉 #1 · 叉子');
  } finally {
    await page.close();
  }
}
async function assertResourceArrows(frame) {
  const edges = await frame.locator('[data-next-edge]').evaluateAll((lines) =>
    lines.map((line) => {
      const fork = document.querySelector(`[data-fork="${line.dataset.nextFork}"]`);
      const circle = fork.querySelector('circle');
      return {
        tone: line.dataset.edgeState,
        owner: fork.getAttribute('data-owner'),
        dash: line.getAttribute('stroke-dasharray'),
        distance: Math.hypot(
          Number(line.getAttribute('x2')) - Number(circle.getAttribute('cx')),
          Number(line.getAttribute('y2')) - Number(circle.getAttribute('cy')),
        ),
      };
    }),
  );
  for (const edge of edges) {
    assert.ok(
      Math.abs(edge.distance - 3.5) < 0.001,
      'every arrow targets the requested fork, including deadlocks',
    );
    assert.ok(edge.dash, 'intent, blocked and deadlock arrows all remain dashed');
    if (edge.tone !== 'planned') assert.notEqual(edge.owner, 'free');
  }
}
// Exploring the simulation never opens the annotation editor or creates a draft.
async function assertNoDraft(frame) {
  assert.equal(await frame.locator('[data-annotation-editor]:visible').count(), 0);
  assert.equal(await frame.locator('[data-annotation-number]').count(), 0);
  assert.equal(await frame.getByRole('dialog').count(), 0);
}
async function assertOwnershipOutside(frame) {
  // Measure rendered geometry, including the SVG transform and stroke width.
  await assertEventually(async () => {
    const endpoints = await frame.locator('[data-ownership-line]').evaluateAll((lines) =>
      lines.map((line) => {
        const owner = line.parentElement.getAttribute('data-owner');
        const person = document
          .querySelector(`[data-philosopher="${owner}"]`)
          .getBoundingClientRect();
        const matrix = line.getScreenCTM();
        const end = new DOMPoint(
          Number(line.getAttribute('x2')),
          Number(line.getAttribute('y2')),
        ).matrixTransform(matrix);
        const distance = Math.hypot(
          end.x - person.x - person.width / 2,
          end.y - person.y - person.height / 2,
        );
        const halfStroke =
          (Number(line.getAttribute('stroke-width')) * Math.hypot(matrix.a, matrix.b)) / 2;
        return {
          gap: distance - halfStroke - person.width / 2,
          distanceFromBorder: distance - person.width / 2,
        };
      }),
    );
    return (
      endpoints.length > 0 &&
      endpoints.every((endpoint) => endpoint.gap >= 0 && endpoint.distanceFromBorder < 4)
    );
  });
}
async function assertEventually(check) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await check()) return;
    await delay(50);
  }
  assert.fail('Expected rendered geometry was not reached');
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const fixture = await startExplanationsFixture(['dining-philosophers']);
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      channel: process.env.PANEON_TEST_BROWSER_CHANNEL ?? 'chrome',
    });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await verifyDiningPhilosophers(page, fixture);
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
    const frame = page.frameLocator('iframe');
    await frame.getByRole('heading', { name: 'Dining philosophers', exact: true }).waitFor();
    await frame.getByRole('button', { name: 'Reproduce deadlock', exact: true }).click();
    await frame.locator('[data-philosopher="4"]').click();
    assert.match(
      await frame.getByTestId('philosopher-details').textContent(),
      /P4.*Blocked.*F4.*F0/,
    );
    const iframe = page.frames().find((item) => item.url().endsWith('/frame.html'));
    assert.equal(
      await iframe.evaluate(() => document.documentElement.classList.contains('dark')),
      true,
    );
    if (process.env.PANEON_TEST_ARTIFACTS)
      await page.screenshot({
        path: join(process.env.PANEON_TEST_ARTIFACTS, 'dining-dark-en.png'),
        fullPage: true,
        animations: 'disabled',
      });
    await assertNoDraft(frame);
    assert.deepEqual(errors, []);
    console.log(
      'Chrome desktop: six-line execution, next/blocked/deadlock resource arrows, fork release versus permit release, 1-second playback, rewind and exploration without drafts passed.',
    );
  } finally {
    await browser?.close();
    await fixture.stop();
  }
}
