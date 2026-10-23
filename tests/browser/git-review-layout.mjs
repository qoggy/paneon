import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import {
  createGraphRepository,
  createLayoutRepository,
  startGitReviewFixture,
} from './git-review-fixture.mjs';
import { annotationTools } from './annotation-tools.mjs';
async function verifyHistoryColumns(frame, page, content, until) {
  const separators = ['调整分支栏宽度', '调整文件区宽度'].map((name) =>
    frame.getByRole('separator', { name }),
  );
  const panes = [
    frame.getByRole('complementary', { name: '历史分支', exact: true }),
    frame.getByRole('region', { name: '提交历史', exact: true }),
    frame.locator('[data-history-files]'),
  ];
  const widths = async () =>
    Promise.all(panes.map(async (pane) => (await pane.boundingBox()).width));
  const styles = () =>
    content.evaluate(() => ({
      cursor: document.documentElement.style.cursor,
      selection: document.documentElement.style.userSelect,
    }));
  const originalStyles = await styles();
  const original = await widths();
  for (const separator of separators) {
    assert.equal(
      (await separator.boundingBox()).width,
      1,
      'Column divider is a single visual line.',
    );
    assert.ok(
      await separator.locator('span').evaluate((el) => el.getBoundingClientRect().width >= 12),
      'Thin column line retains a practical pointer hit area.',
    );
  }
  assert.equal(
    await content.evaluate(
      () => getComputedStyle(document.querySelector('[data-history-workspace]')).columnGap,
    ),
    '0px',
    'Column handles replace the grid gap instead of adding extra spacing.',
  );
  const retainedRow = await frame.locator('[data-commit-id][aria-pressed="true"]').elementHandle();
  const retainedDiff = await frame.locator('[data-diff-source]').elementHandle();
  const count = await frame.locator('[data-history-count]').getAttribute('data-history-count');
  await frame.getByRole('button', { name: '整体批注', exact: true }).click();
  const editor = frame.getByLabel('批注内容', { exact: true });
  await editor.fill('Unsaved column sizing draft');
  const history = frame.locator('[data-commit-scroll]');
  await history.evaluate((el) => {
    el.scrollTop = 40;
  });
  const scrollTop = await history.evaluate((el) => el.scrollTop);
  let requests = 0;
  const observe = (request) => {
    if (request.url().includes('/actions/')) requests++;
  };
  page.on('request', observe);
  async function start(index) {
    const separator = separators[index];
    const box = await separator.boundingBox();
    const offset = await separator.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      // Start outside the 1px line to prove its transparent hit area works.
      const x = rect.left + rect.width / 2 + 3;
      for (
        let y = Math.min(rect.bottom - 4, innerHeight - 4);
        y >= Math.max(rect.top + 4, 4);
        y -= 4
      )
        if (el.contains(document.elementFromPoint(x, y))) return y - rect.top;
      return null;
    });
    assert.notEqual(offset, null, 'A visible part of the column handle must accept pointer input.');
    const point = { x: box.x + box.width / 2 + 3, y: box.y + offset };
    await separator.evaluate((el) =>
      el.addEventListener(
        'pointerdown',
        (e) => {
          el.dataset.testPointer = String(e.pointerId);
        },
        { once: true },
      ),
    );
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    assert.equal(
      await separator.evaluate((el) => el.hasPointerCapture(Number(el.dataset.testPointer))),
      true,
    );
    return point;
  }
  async function drag(index, delta) {
    const point = await start(index);
    await page.mouse.move(point.x + delta, point.y, { steps: 6 });
    await page.mouse.up();
    assert.deepEqual(await styles(), originalStyles);
    return point;
  }
  for (const index of [0, 1]) {
    const pane = index === 0 ? 0 : 2;
    const direction = index === 0 ? 1 : -1;
    const before = await widths();
    const point = await drag(index, direction * 70);
    const after = await widths();
    assert.ok(
      Math.abs(after[pane] - before[pane] - 70) < 2,
      'Real horizontal dragging enlarges the requested side pane.',
    );
    assert.ok(Math.abs(after[1] - before[1] + 70) < 2);
    assert.ok(
      Math.abs(after[2 - pane] - before[2 - pane]) < 2,
      'The other side pane keeps its width.',
    );
    await page.mouse.move(point.x + 200, point.y);
    assert.deepEqual(await widths(), after, 'Released drag no longer changes column widths.');
    await separators[index].press('ArrowRight');
    assert.ok(Math.abs((await widths())[pane] - after[pane] - direction * 16) < 2);
    await separators[index].press('ArrowLeft');
    let pointAtLimit = await start(index);
    await page.mouse.move(direction === 1 ? 1 : 1439, pointAtLimit.y, { steps: 6 });
    await page.mouse.up();
    assert.deepEqual(await styles(), originalStyles);
    assert.ok(
      Math.abs(
        (await widths())[pane] - Number(await separators[index].getAttribute('aria-valuemin')),
      ) < 2,
    );
    pointAtLimit = await start(index);
    await page.mouse.move(direction === 1 ? 1439 : 1, pointAtLimit.y, { steps: 6 });
    await page.mouse.up();
    assert.deepEqual(await styles(), originalStyles);
    assert.ok(
      Math.abs((await widths())[1] - 256) < 2,
      'The commit list retains its minimum usable width.',
    );
    const current = await widths();
    await drag(index, direction * (original[pane] - current[pane]));
    assert.equal(await separators[index].getAttribute('aria-orientation'), 'vertical');
    const cancelled = await start(index);
    await page.mouse.move(cancelled.x + 20, cancelled.y);
    await separators[index].evaluate((el, mode) => {
      const pointerId = Number(el.dataset.testPointer);
      if (mode === 0)
        el.dispatchEvent(new PointerEvent('pointercancel', { pointerId, bubbles: true }));
      else el.releasePointerCapture(pointerId);
    }, index);
    await page.mouse.move(cancelled.x + 21, cancelled.y);
    await until(
      async () => (await separators[index].getAttribute('data-dragging')) === null,
      'Column gesture did not finish.',
    );
    await page.mouse.up();
    assert.deepEqual(await styles(), originalStyles);
    const stopped = await widths();
    await page.mouse.move(cancelled.x + 90, cancelled.y);
    assert.deepEqual(await widths(), stopped);
    await drag(index, direction * (original[pane] - stopped[pane]));
  }
  assert.equal(await retainedRow.evaluate((el) => el.isConnected), true);
  assert.equal(await retainedDiff.evaluate((el) => el.isConnected), true);
  assert.equal(await retainedRow.getAttribute('aria-pressed'), 'true');
  assert.equal(
    await frame.locator('[data-history-count]').getAttribute('data-history-count'),
    count,
  );
  assert.equal(await history.evaluate((el) => el.scrollTop), scrollTop);
  assert.equal(await editor.inputValue(), 'Unsaved column sizing draft');
  await frame.getByRole('button', { name: '取消', exact: true }).click();
  assert.equal(requests, 0, 'Column resizing must not query Git or submit annotations.');
  page.off('request', observe);
  const outside = await start(0);
  await page.mouse.move(-3000, outside.y);
  await page.mouse.up();
  await page.mouse.move(outside.x, outside.y);
  await until(
    async () => (await separators[0].getAttribute('data-dragging')) === null,
    'Returning after release outside the viewport kept the gesture active.',
  );
  assert.deepEqual(await styles(), originalStyles);
  await start(1);
  await content.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.mouse.up();
  assert.deepEqual(await styles(), originalStyles, 'Window blur ends the gesture.');
  await start(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await until(
    async () => !(await separators[0].isVisible()),
    'Mobile layout retained a column handle.',
  );
  await until(
    async () => (await styles()).selection === originalStyles.selection,
    'Mobile transition did not release column capture.',
  );
  await page.mouse.up();
  assert.equal(await separators[1].isVisible(), false);
  assert.deepEqual(await styles(), originalStyles);
  assert.equal(
    await content.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    true,
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await until(
    async () => Math.abs((await widths())[0] - original[0]) < 2,
    'Column proportions did not survive resizing.',
  );
  const available = original.reduce((sum, width) => sum + width, 0);
  await page.setViewportSize({ width: 1100, height: 1000 });
  await until(async () => {
    const resized = await widths();
    const nextAvailable = resized.reduce((sum, width) => sum + width, 0);
    return [0, 2].every(
      (index) => Math.abs(resized[index] / nextAvailable - original[index] / available) < 0.002,
    );
  }, 'Desktop resizing did not preserve side pane proportions.');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await until(
    async () => (await widths()).every((width, index) => Math.abs(width - original[index]) < 2),
    'Both side pane widths did not return after desktop resizing.',
  );
  await start(1);
  await frame.getByRole('button', { name: '未提交改动', exact: true }).evaluate((el) => el.click());
  await page.mouse.up();
  await until(
    async () => (await separators[0].count()) === 0,
    'Column handles survived leaving history.',
  );
  assert.deepEqual(await styles(), originalStyles);
  await frame.getByRole('button', { name: '提交记录', exact: true }).click();
  await separators[0].waitFor();
  await until(
    async () => (await widths()).every((width, index) => Math.abs(width - original[index]) < 2),
    'Both side pane widths did not survive returning to history.',
  );
  await until(
    async () => !(await frame.getByRole('button', { name: '刷新历史', exact: true }).isDisabled()),
    'Returning to history did not finish its query.',
  );
  if (process.env.PANEON_TEST_ARTIFACTS) {
    await mkdir(process.env.PANEON_TEST_ARTIFACTS, { recursive: true });
    await page.screenshot({
      path: join(process.env.PANEON_TEST_ARTIFACTS, 'git-history-columns.png'),
    });
  }
  console.log(
    'B57 columns: real pointer drag of both boundaries, minima, keyboard, cancel/lost capture, narrow transition and retained review state passed.',
  );
}

async function verifyHistorySplit(frame, page, content, until) {
  const divider = frame.getByRole('separator', { name: '调整提交历史与文件差异高度' });
  const upper = frame.locator('[data-history-workspace]');
  const diff = frame.getByRole('region', { name: '文件差异', exact: true });
  const history = frame.locator('[data-commit-scroll]');
  const retainedRow = await frame.locator('[data-commit-id][aria-pressed="true"]').elementHandle();
  const retainedDiff = await frame.locator('[data-diff-source]').elementHandle();
  const count = await frame.locator('[data-history-count]').getAttribute('data-history-count');
  let requests = 0;
  const observe = (request) => {
    if (request.url().includes('/actions/')) requests++;
  };
  page.on('request', observe);
  const sizes = async () => ({
    upper: (await upper.boundingBox()).height,
    diff: (await diff.boundingBox()).height,
  });
  const styles = () =>
    content.evaluate(() => ({
      cursor: document.documentElement.style.cursor,
      selection: document.documentElement.style.userSelect,
    }));
  const originalStyles = await styles();
  const start = async () => {
    await divider.evaluate((el) =>
      el.addEventListener(
        'pointerdown',
        (e) => {
          el.dataset.testPointer = String(e.pointerId);
        },
        { once: true },
      ),
    );
    // Hover performs Playwright's visibility, stability and hit-target checks after viewport changes.
    await divider.hover({ position: { x: 20, y: 0.5 } });
    const box = await divider.boundingBox();
    const point = { x: box.x + 20, y: box.y + 0.5 };
    await page.mouse.down();
    assert.equal(
      await divider.evaluate((el) => el.hasPointerCapture(Number(el.dataset.testPointer))),
      true,
    );
    return point;
  };
  const assertStopped = async (point) => {
    const stopped = await sizes();
    await page.mouse.move(point.x, point.y + 90);
    assert.deepEqual(await sizes(), stopped, 'Moving after drag completion must not resize.');
    assert.deepEqual(await styles(), originalStyles, 'Temporary document styles are restored.');
  };
  await divider.waitFor();
  const initial = await sizes();
  const initialTop = initial.upper;
  const available = initial.upper + initial.diff;
  const expectedTop = Math.min(
    Number(await divider.getAttribute('aria-valuemax')),
    Math.max(Number(await divider.getAttribute('aria-valuemin')), (available * 0.8) / 2.8),
  );
  assert.ok(
    Math.abs(initialTop - expectedTop) < 1,
    'Initial split retains the original 0.8fr:2fr ratio within pane limits.',
  );
  let point = await start();
  await page.mouse.move(point.x, point.y + 100, { steps: 8 });
  await page.mouse.up();
  const expanded = await sizes();
  assert.ok(
    expanded.upper > initial.upper + 90,
    'Real pointer movement expands the upper workspace.',
  );
  assert.ok(expanded.diff < initial.diff - 90, 'The diff shrinks by the matching amount.');
  assert.ok(Math.abs(expanded.upper + expanded.diff - initial.upper - initial.diff) < 2);
  await assertStopped(point);
  point = await start();
  await page.mouse.move(point.x, point.y - 70, { steps: 5 });
  await page.mouse.up();
  assert.ok(
    (await sizes()).upper < expanded.upper - 60,
    'Dragging upward restores space to the diff.',
  );

  for (const direction of [-1, 1]) {
    point = await start();
    await page.mouse.move(point.x, point.y + direction * 2000, { steps: 5 });
    await page.mouse.up();
    const bounded = await sizes();
    const limit = Number(
      await divider.getAttribute(direction < 0 ? 'aria-valuemin' : 'aria-valuemax'),
    );
    assert.ok(Math.abs(bounded.upper - limit) <= 1);
    assert.ok(
      bounded.upper >= 200 && bounded.diff >= 239,
      'Both panes retain usable minimum heights.',
    );
    assert.ok(await history.evaluate((el) => el.scrollHeight > el.clientHeight));
  }
  await divider.focus();
  const beforeKey = await sizes();
  await divider.press('ArrowUp');
  assert.ok(Math.abs((await sizes()).upper - beforeKey.upper + 16) < 1);
  await divider.press('ArrowDown');
  assert.ok(Math.abs((await sizes()).upper - beforeKey.upper) < 1);
  assert.equal(await divider.evaluate((el) => document.activeElement === el), true);
  assert.equal(await divider.getAttribute('aria-orientation'), 'horizontal');

  for (const termination of ['cancel', 'lost-capture']) {
    point = await start();
    await page.mouse.move(point.x, point.y - 40);
    await divider.evaluate((el, mode) => {
      const pointerId = Number(el.dataset.testPointer);
      if (mode === 'cancel')
        el.dispatchEvent(new PointerEvent('pointercancel', { pointerId, bubbles: true }));
      else el.releasePointerCapture(pointerId);
    }, termination);
    // Native release updates pending capture; Chrome dispatches lostpointercapture at the next pointer event.
    if (termination === 'lost-capture') await page.mouse.move(point.x + 1, point.y - 40);
    await until(
      async () => (await divider.getAttribute('data-dragging')) === null,
      `Drag did not end after ${termination}.`,
    );
    await page.mouse.up();
    await assertStopped(point);
  }
  // Preserve both loaded content and an unsaved contextual editor across resizing.
  await frame.getByRole('button', { name: '整体批注', exact: true }).click();
  const editor = frame.getByLabel('批注内容', { exact: true });
  await editor.fill('Unsaved splitter regression draft');
  await history.evaluate((el) => {
    el.scrollTop = 40;
  });
  const scrollTop = await history.evaluate((el) => el.scrollTop);
  const codeScroll = frame.locator('[data-diff-scroll="new"]').first();
  await codeScroll.evaluate((el) => {
    el.scrollLeft = 120;
  });
  const scrollLeft = await codeScroll.evaluate((el) => el.scrollLeft);
  point = await start();
  await page.mouse.move(point.x, point.y - 25);
  await page.mouse.up();
  assert.equal(await editor.inputValue(), 'Unsaved splitter regression draft');
  assert.equal(await retainedRow.evaluate((el) => el.isConnected), true);
  assert.equal(await retainedRow.getAttribute('aria-pressed'), 'true');
  assert.equal(await codeScroll.evaluate((el) => el.scrollLeft), scrollLeft);
  assert.equal(await retainedDiff.evaluate((el) => el.isConnected), true);
  assert.equal(
    await frame.locator('[data-history-count]').getAttribute('data-history-count'),
    count,
  );
  assert.equal(await history.evaluate((el) => el.scrollTop), scrollTop);
  await frame.getByRole('button', { name: '取消', exact: true }).click();
  assert.equal(requests, 0, 'Splitter interactions must not read Git or submit feedback.');
  page.off('request', observe);

  await start();
  await page.setViewportSize({ width: 390, height: 844 });
  await until(async () => !(await divider.isVisible()), 'Narrow layout kept the divider visible.');
  await until(
    async () => (await styles()).selection === originalStyles.selection,
    'Breakpoint change did not clean up the drag.',
  );
  await page.mouse.up();
  assert.deepEqual(await styles(), originalStyles);
  assert.equal(
    await content.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    true,
  );
  await page.setViewportSize({ width: 1440, height: 700 });
  await until(async () => (await sizes()).diff >= 239, 'Resize did not re-constrain pane heights.');
  assert.ok((await sizes()).upper >= 200);
  assert.ok(
    Number(await divider.getAttribute('aria-valuenow')) <=
      Number(await divider.getAttribute('aria-valuemax')),
  );
  assert.ok((await diff.boundingBox()).y + (await diff.boundingBox()).height <= 701);
  for (const height of [600, 576]) {
    await page.setViewportSize({ width: 1440, height });
    await until(
      async () => (await sizes()).upper >= 203 && (await sizes()).diff >= 239,
      'Short viewport shrank panes below actual child minima.',
    );
    const bounds = await content.evaluate(() => {
      const rect = (selector) => {
        const r = document.querySelector(selector).getBoundingClientRect();
        return { top: r.top, bottom: r.bottom };
      };
      return {
        upper: rect('[data-history-workspace]'),
        details: rect('[aria-label="提交说明"]'),
        files: rect('[aria-label="改动文件"]'),
        divider: rect('[role="separator"][aria-orientation="horizontal"]'),
        diff: rect('[aria-label="文件差异"]'),
      };
    });
    assert.ok(
      bounds.details.bottom <= bounds.upper.bottom + 1,
      'Commit details overflow the upper workspace.',
    );
    assert.ok(bounds.files.bottom <= bounds.upper.bottom + 1);
    assert.ok(bounds.upper.bottom <= bounds.divider.top + 1);
    assert.ok(bounds.diff.top >= bounds.divider.bottom - 1, 'Diff overlaps the upper workspace.');
    await content.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    assert.ok(
      await content.evaluate(
        () => window.scrollY > 0 || document.documentElement.scrollHeight <= innerHeight,
      ),
      'Overflowing short viewport allows page scrolling.',
    );
    assert.ok(
      await content.evaluate(
        () =>
          document.querySelector('[data-git-diff-scroll]').getBoundingClientRect().bottom <=
          innerHeight + 1,
      ),
      'Diff bottom is reachable by page scrolling.',
    );
    await content.evaluate(() => window.scrollTo(0, 0));
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await until(
    async () => (await frame.locator('[data-git-workspace]').boundingBox()).height > 700,
    'Workspace did not grow again.',
  );
  // CSS resizes before the observer's React update; wait for the handle's new geometry, too.
  await until(
    () =>
      content.evaluate(() => {
        const workspace = document.querySelector('[data-git-workspace]');
        const divider = document.querySelector('[role="separator"][aria-orientation="horizontal"]');
        const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
        return (
          window.scrollY === 0 &&
          Number(divider.getAttribute('aria-valuemax')) ===
            Math.round(workspace.clientHeight - 15 * rem - 1)
        );
      }),
    'Divider constraints did not settle after viewport growth.',
  );
  point = await start();
  await page.mouse.move(point.x, point.y + initialTop - (await sizes()).upper);
  await page.mouse.up();
  const restored = await sizes();
  // Leaving history while captured must release capture and restore styles; session ratio survives.
  await start();
  await frame.getByRole('button', { name: '未提交改动', exact: true }).evaluate((el) => el.click());
  await page.mouse.up();
  await until(async () => (await divider.count()) === 0, 'Divider survived leaving history.');
  assert.deepEqual(await styles(), originalStyles);
  await frame.getByRole('button', { name: '提交记录', exact: true }).click();
  await divider.waitFor();
  await until(
    async () => Math.abs((await sizes()).upper - restored.upper) < 1,
    'Session split was not preserved.',
  );
  await history.evaluate((el) => {
    el.scrollTop = 0;
  });
  if (process.env.PANEON_TEST_ARTIFACTS)
    await page.screenshot({
      path: join(process.env.PANEON_TEST_ARTIFACTS, 'git-history-splitter.png'),
    });
  console.log(
    'B54 splitter: real pointer drag, limits, release/cancel/lost capture, keyboard, resize, retained DOM/draft/history and session ratio passed.',
  );
}

export async function verifyGitLayout(f, page) {
  const frame = page.frameLocator('iframe');
  const comments = annotationTools(frame, page);
  const button = (name) => frame.getByRole('button', { name, exact: true });
  const until = async (check, message) => {
    for (let attempt = 0; attempt < 300; attempt++) {
      if (await check()) return;
      await delay(50);
    }
    throw new Error(message);
  };
  // B45: real history, long subjects/authors, many files, independently scrollable split code.
  const layout = await createLayoutRepository(f.root);
  const layoutPanel = await f.run({
    title: 'Git workbench layout acceptance',
    repositories: [{ id: 'layout', path: layout.repository, label: 'Layout repository' }],
    initialView: {
      repositoryId: 'layout',
      type: 'history',
      commit: layout.tip,
      file: layout.filename,
    },
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(f.url(layoutPanel));
  await frame.locator('[data-commit-id]').first().waitFor();
  await frame.locator('[data-code-side="new"][data-line="1"]').waitFor();
  await comments.assertNoLegacySection();
  const layoutFrame = page.frames().find((candidate) => candidate.url().endsWith('/frame.html'));
  assert.equal(await frame.locator('[data-commit-id]').count(), 50);
  assert.equal(
    await frame.locator('[data-commit-id]').first().getAttribute('aria-pressed'),
    'true',
  );
  const columns = await frame
    .locator('[data-commit-id]')
    .first()
    .evaluate((row) => {
      const children = [...row.children].map((cell) => {
        const rect = cell.getBoundingClientRect();
        return { left: rect.left, right: rect.right, top: rect.top, height: rect.height };
      });
      return {
        height: row.getBoundingClientRect().height,
        children,
        subjectOverflow:
          row.querySelector('[data-commit-subject]').scrollWidth >
          row.querySelector('[data-commit-subject]').clientWidth,
        fullSubject: row.children[1].title,
      };
    });
  assert.equal(columns.height, 28);
  assert.equal(columns.subjectOverflow, true);
  assert.equal(await frame.locator('[data-commit-graph]').count(), 50);
  const firstGraph = await frame.locator('[data-commit-graph]').first().innerHTML();
  assert.ok(columns.fullSubject.length > 150);
  // Hold a commit query so the loading frame itself is observable.
  const retainedRow = await frame.locator('[data-commit-id]').first().elementHandle();
  const retainedDiff = await frame.locator('[data-diff-source]').elementHandle();
  const secondCommit = await frame
    .locator('[data-commit-id]')
    .nth(1)
    .getAttribute('data-commit-id');
  const queryUrl = `**/api/panels/${layoutPanel.instanceId}/actions/*`;
  let releaseQuery;
  let queryStarted;
  const gate = new Promise((resolve) => {
    releaseQuery = resolve;
  });
  const started = new Promise((resolve) => {
    queryStarted = resolve;
  });
  await page.route(queryUrl, async (route) => {
    if (route.request().postDataJSON()?.input?.request?.commit === secondCommit) {
      queryStarted();
      await gate;
    }
    await route.continue();
  });
  try {
    await frame.locator('[data-commit-id]').nth(1).click();
    await started;
    assert.equal(
      await frame.locator('[data-commit-id]').count(),
      50,
      'Pending queries must not clear commit history.',
    );
    assert.equal(
      await retainedRow.evaluate((element) => element.isConnected),
      true,
      'History rows remain mounted.',
    );
    assert.equal(
      await retainedDiff.evaluate((element) => element.isConnected),
      false,
      'Old diff closes immediately when a new commit is requested.',
    );
    assert.equal(await frame.locator('[data-file-id]').count(), 0);
    assert.equal(await frame.locator('[data-file-scroll]').getAttribute('aria-busy'), 'true');
    assert.equal(
      await frame.locator(`[data-commit-id="${secondCommit}"]`).getAttribute('aria-pressed'),
      'true',
      'The intended commit is highlighted before its response arrives.',
    );
    if (process.env.PANEON_TEST_ARTIFACTS) {
      await mkdir(process.env.PANEON_TEST_ARTIFACTS, { recursive: true });
      await page.screenshot({
        path: join(process.env.PANEON_TEST_ARTIFACTS, 'git-commit-loading.png'),
      });
    }
  } finally {
    releaseQuery();
  }
  await until(
    async () =>
      (await frame.locator(`[data-commit-id="${secondCommit}"]`).getAttribute('aria-pressed')) ===
      'true',
    'Selected commit did not update.',
  );
  await frame.getByText('该范围没有文件改动。', { exact: true }).waitFor();
  await page.unroute(queryUrl);
  await frame.locator('[data-commit-id]').first().click();
  await frame.getByRole('button', { name: `M ${layout.filename}`, exact: true }).waitFor();
  // Returning from an empty commit still requires an explicit file selection.
  await frame.getByRole('button', { name: `M ${layout.filename}`, exact: true }).click();
  await frame.locator('[data-code-side="new"][data-line="1"]').waitFor();
  const beforeFailure = await frame.locator('[data-diff-source]').elementHandle();
  await page.route(queryUrl, (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: false,
        error: { code: 'TEST_FAILURE', message: 'Intentional Git query failure.' },
      }),
    }),
  );
  await frame.locator('[data-commit-id]').nth(1).click();
  await frame.getByText('读取失败', { exact: true }).waitFor();
  assert.equal(
    await beforeFailure.evaluate((element) => element.isConnected),
    false,
    'A failed query does not relabel the old diff as a different commit.',
  );
  assert.equal(
    await frame.locator(`[data-commit-id="${secondCommit}"]`).getAttribute('aria-pressed'),
    'true',
  );
  await page.unroute(queryUrl);
  await button('刷新历史').click();
  await frame.getByText('读取失败', { exact: true }).waitFor({ state: 'hidden' });
  await until(
    async () => (await frame.getByRole('status').count()) === 0,
    'Refresh did not finish.',
  );

  for (let i = 1; i < columns.children.length; i++)
    assert.ok(columns.children[i].left >= columns.children[i - 1].right);
  assert.equal(columns.children[2].top, columns.children[3].top);
  const commitScroll = frame.locator('[data-commit-scroll]');
  const fileScroll = frame.locator('[data-file-scroll]');
  const commitBefore = await commitScroll.evaluate((el) => ({
    top: el.scrollTop,
    max: el.scrollHeight - el.clientHeight,
  }));
  assert.ok(commitBefore.max > 0);
  await commitScroll.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  assert.ok(await commitScroll.evaluate((el) => el.scrollTop > 0));
  await button('加载更多（每批 50）').click();
  await until(
    async () => (await frame.locator('[data-commit-id]').count()) === 55,
    'history did not extend',
  );
  assert.equal(await frame.locator('[data-commit-graph]').count(), 55);
  assert.equal(
    await frame.locator('[data-commit-graph]').first().innerHTML(),
    firstGraph,
    'Appending history retains graph geometry.',
  );
  await frame.locator('[data-commit-id]').first().click();
  await frame.getByRole('button', { name: `M ${layout.filename}`, exact: true }).click();
  await frame.locator('[data-diff-source]').waitFor();
  await verifyHistoryColumns(frame, page, layoutFrame, until);
  await verifyHistorySplit(frame, page, layoutFrame, until);
  await commitScroll.evaluate((el) => {
    el.scrollTop = 0;
  });
  assert.ok(await fileScroll.evaluate((el) => el.scrollHeight > el.clientHeight));
  await fileScroll.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  assert.equal(await commitScroll.evaluate((el) => el.scrollTop), 0);
  assert.equal(await frame.getByLabel('搜索文件', { exact: true }).count(), 0);
  assert.equal(await frame.getByText(/^改动文件 ·/).count(), 0);
  assert.equal(await frame.getByRole('heading', { name: '提交说明', exact: true }).count(), 0);
  const oldViewport = frame.locator('[data-diff-scroll="old"]').first();
  const newViewport = frame.locator('[data-diff-scroll="new"]').first();
  const oldBox = await oldViewport.boundingBox(),
    newBox = await newViewport.boundingBox();
  assert.ok(oldBox.x + oldBox.width <= newBox.x + 1, 'old and new visible panes overlap');
  for (const side of ['old', 'new']) {
    const viewport = frame.locator(`[data-diff-scroll="${side}"]`).first();
    assert.ok(await viewport.evaluate((el) => el.scrollWidth > el.clientWidth));
    await viewport.evaluate((el) => {
      el.scrollLeft = el.scrollWidth;
    });
    const endpoint = await frame
      .locator(`[data-code-side="${side}"][data-line="1"]`)
      .evaluate((element) => {
        const marker = element.textContent.indexOf('_END');
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        let node,
          offset = 0,
          first,
          last;
        while ((node = walker.nextNode())) {
          if (!first && offset + node.length > marker) first = { node, offset: marker - offset };
          if (offset + node.length >= marker + 4) {
            last = { node, offset: marker + 4 - offset };
            break;
          }
          offset += node.length;
        }
        const range = document.createRange();
        range.setStart(first.node, first.offset);
        range.setEnd(last.node, last.offset);
        const bounds = range.getBoundingClientRect(),
          clip = element.closest('[data-diff-scroll]').getBoundingClientRect();
        return {
          left: bounds.left,
          right: bounds.right,
          clipLeft: clip.left,
          clipRight: clip.right,
          quote: range.toString(),
        };
      });
    assert.equal(endpoint.quote, '_END');
    assert.ok(
      endpoint.left >= endpoint.clipLeft && endpoint.right <= endpoint.clipRight,
      `${side} code endpoint not reachable`,
    );
  }
  const aligned = await layoutFrame.evaluate(() =>
    ['old', 'new'].map(
      (side) =>
        document.querySelector(`[data-code-side="${side}"][data-line="2"]`).getBoundingClientRect()
          .top,
    ),
  );
  assert.equal(aligned[0], aligned[1]);
  assert.equal(
    await layoutFrame.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    true,
  );
  // Tail selection remains the original source range after horizontal scrolling.
  await frame.locator('[data-code-side="new"][data-line="1"]').evaluate((element) => {
    const from = element.textContent.indexOf('NEW_END'),
      to = from + 7;
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let node,
      offset = 0,
      first,
      last;
    while ((node = walker.nextNode())) {
      if (!first && offset + node.length > from) first = { node, offset: from - offset };
      if (offset + node.length >= to) {
        last = { node, offset: to - offset };
        break;
      }
      offset += node.length;
    }
    const range = document.createRange();
    range.setStart(first.node, first.offset);
    range.setEnd(last.node, last.offset);
    const selection = document.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });
  await comments.write('Long line endpoint annotation');
  await comments.save();
  const marker = frame.getByRole('button', { name: '批注 1', exact: true });
  await marker.waitFor();
  await newViewport.evaluate((element) => {
    element.scrollLeft = 0;
  });
  await marker.waitFor({ state: 'hidden' });
  await newViewport.evaluate((element) => {
    element.scrollLeft = element.scrollWidth;
  });
  await marker.waitFor();
  await marker.click();
  await comments.write('Temporary edit to cancel');
  await button('取消').click();
  assert.equal(await comments.text(1), 'Long line endpoint annotation');
  assert.equal((await f.events(layoutPanel)).length, 0);
  await oldViewport.evaluate((element) => {
    element.scrollLeft = element.scrollWidth;
  });
  await frame.locator('[data-code-side="old"][data-line="1"]').evaluate((element) => {
    const from = element.textContent.indexOf('OLD_END'),
      to = from + 7;
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let node,
      offset = 0,
      first,
      last;
    while ((node = walker.nextNode())) {
      if (!first && offset + node.length > from) first = { node, offset: from - offset };
      if (offset + node.length >= to) {
        last = { node, offset: to - offset };
        break;
      }
      offset += node.length;
    }
    const range = document.createRange();
    range.setStart(first.node, first.offset);
    range.setEnd(last.node, last.offset);
    const selection = document.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });
  await comments.write('Old side endpoint annotation');
  await comments.save();
  // Explicit line controls use interval references, while native selection registers a whole side.
  // Their saved markers must still attach beside the actual old/new source lines.
  await oldViewport.evaluate((element) => {
    element.scrollLeft = 0;
  });
  await newViewport.evaluate((element) => {
    element.scrollLeft = 0;
  });
  await button('选择对象').click();
  for (const [side, number] of [
    ['旧', 3],
    ['新', 4],
  ]) {
    await button(`选择${side}侧第 3 行`).click();
    await comments.write(`${side}侧第三行批注`);
    await comments.save();
    const lineMarker = frame.getByRole('button', { name: `批注 ${number}`, exact: true });
    await lineMarker.waitFor();
    const markerBounds = await lineMarker.boundingBox();
    const lineBounds = await frame
      .locator(`[data-code-side="${side === '旧' ? 'old' : 'new'}"][data-line="3"]`)
      .boundingBox();
    assert.ok(
      Math.abs(markerBounds.y - lineBounds.y) < 50,
      'line annotation marker detached from its source',
    );
    await lineMarker.click();
    assert.equal(
      await frame.getByLabel('批注内容', { exact: true }).inputValue(),
      `${side}侧第三行批注`,
    );
    await button('取消').click();
  }
  for (const side of ['old', 'new']) {
    await frame.getByLabel('侧', { exact: true }).selectOption(side);
    await frame.getByLabel('起始行', { exact: true }).fill('2');
    await frame.getByLabel('结束行', { exact: true }).fill('3');
    await button('选择连续行').click();
  }
  await comments.write('同时批注两侧连续行');
  await comments.save();
  await until(
    async () => (await frame.getByRole('button', { name: '批注 5', exact: true }).count()) === 2,
    'both range annotation markers did not appear after the scheduled geometry measurement',
  );
  await frame.getByRole('button', { name: '批注 5', exact: true }).first().click();
  assert.equal(
    await frame.getByLabel('批注内容', { exact: true }).inputValue(),
    '同时批注两侧连续行',
  );
  await button('取消').click();
  assert.equal((await f.events(layoutPanel)).length, 0);
  const layoutArtifacts = process.env.PANEON_TEST_ARTIFACTS;
  if (layoutArtifacts) {
    await mkdir(layoutArtifacts, { recursive: true });
    await page.screenshot({
      path: join(layoutArtifacts, 'git-history-desktop.png'),
      fullPage: true,
    });
  }
  await button('提交批注').click();
  await until(
    async () => (await f.events(layoutPanel)).length === 1,
    'layout annotation was not delivered',
  );
  const tail = (await f.events(layoutPanel))[0].payload.annotations[0].targets[0];
  assert.equal(tail.text.quote, 'NEW_END');
  const oldTail = (await f.events(layoutPanel))[0].payload.annotations[1].targets[0];
  assert.equal(oldTail.text.quote, 'OLD_END');
  assert.equal(oldTail.ref.side, 'old');
  assert.equal(tail.ref.side, 'new');
  await frame.locator('[data-commit-id]').nth(1).click();
  await until(
    async () =>
      (await frame.locator('[data-commit-id]').nth(1).getAttribute('aria-pressed')) === 'true',
    'Commit selection did not complete.',
  );
  await frame.getByText('该范围没有文件改动。', { exact: true }).waitFor();
  await frame.locator('[data-commit-id]').first().click();
  await frame.getByRole('button', { name: `M ${layout.filename}`, exact: true }).waitFor();
  assert.equal(await frame.locator('[data-diff-source]').count(), 0);
  // Restore the target's exact old snapshot through the compact catalog.
  await comments.locate(2);
  await frame.getByRole('button', { name: '批注 2', exact: true }).waitFor();
  await comments.locate(1);
  await frame.getByText('回看保留快照', { exact: true }).waitFor();
  await marker.waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await frame.getByRole('separator', { name: '调整提交历史与文件差异高度' }).isVisible(),
    false,
  );
  assert.equal(
    await layoutFrame.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    true,
    'mobile Git layout overflow',
  );
  assert.equal(await button('提交批注').isVisible(), true);
  await frame.locator('[data-git-diff-scroll]').scrollIntoViewIfNeeded();
  if (layoutArtifacts)
    await page.screenshot({
      path: join(layoutArtifacts, 'git-history-mobile.png'),
      fullPage: true,
    });
  await page.setViewportSize({ width: 1440, height: 1000 });
  const graphRepo = await createGraphRepository(f.root);
  const graphPanel = await f.run({
    title: 'Git Log · feature/history',
    repositories: [{ id: 'graph', path: graphRepo.repository, label: 'Workbench' }],
    initialView: { repositoryId: 'graph', type: 'history', commit: graphRepo.tip },
  });
  await page.goto(f.url(graphPanel));
  const tipRow = frame.locator(`[data-commit-id="${graphRepo.tip}"]`);
  const mergeRow = frame.locator(`[data-commit-id="${graphRepo.merge}"]`);
  await tipRow.waitFor();
  assert.equal(await frame.locator('[data-diff-source]').count(), 0);
  assert.equal(await frame.getByRole('region', { name: '文件差异', exact: true }).count(), 0);
  const compactGeometry = await graphFrameForGeometry();
  assert.ok(
    compactGeometry.details.top - compactGeometry.files.bottom <= 5,
    'Commit message follows the file list with only a small gap.',
  );
  assert.ok(
    compactGeometry.files.height < 100,
    'A one-file list does not reserve half the workbench.',
  );
  assert.ok(
    compactGeometry.upper.bottom >= 980,
    'History without an open file uses the full workspace.',
  );
  async function graphFrameForGeometry() {
    return frame.locator('[data-history-workspace]').evaluate((upper) => ({
      upper: upper.getBoundingClientRect().toJSON(),
      files: upper.querySelector('[aria-label="改动文件"]').getBoundingClientRect().toJSON(),
      details: upper.querySelector('[aria-label="提交说明"]').getBoundingClientRect().toJSON(),
    }));
  }
  assert.equal(await frame.locator('[data-commit-graph]').count(), 6);
  assert.equal(await frame.locator('[data-commit-message]').innerText(), graphRepo.message + '\n');
  assert.equal(
    await frame.locator('[data-commit-message] *').count(),
    0,
    'Messages are plain text.',
  );
  assert.equal(await frame.locator(`[data-commit-id="${graphRepo.unrelated}"]`).count(), 0);
  await tipRow.getByText('HEAD', { exact: true }).waitFor();
  await tipRow.getByText('feature/history', { exact: true }).waitFor();
  for (const name of ['main', 'origin/main', 'v0.1.0', 'reviewed'])
    assert.equal(await mergeRow.getByText(name, { exact: true }).count(), 1);
  const graphNodes = await frame
    .locator('[data-commit-graph] circle')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('cx')));
  assert.ok(new Set(graphNodes).size >= 2, 'Forked history occupies multiple graph lanes.');
  assert.equal(await frame.locator('[data-commit-id] > .font-mono').count(), 0);
  await tipRow.focus();
  await tipRow.press('ArrowDown');
  await until(
    async () => (await mergeRow.getAttribute('aria-pressed')) === 'true',
    'Arrow navigation did not select the next commit.',
  );
  assert.equal(
    (await frame.locator('[data-commit-message]').innerText()).trim(),
    'Merge feature/cache into main',
  );
  await mergeRow.press('Home');
  await until(
    async () => (await tipRow.getAttribute('aria-pressed')) === 'true',
    'Home did not return to the branch tip.',
  );
  const branchSidebar = frame.getByRole('complementary', { name: '历史分支', exact: true });
  const sidebarBounds = await branchSidebar.boundingBox();
  const historyBounds = await frame
    .getByRole('region', { name: '提交历史', exact: true })
    .boundingBox();
  assert.ok(
    sidebarBounds.x + sidebarBounds.width <= historyBounds.x,
    'Branches sit to the left of history.',
  );
  const localBranches = branchSidebar.getByRole('region', { name: '本地分支', exact: true });
  const featureFolder = localBranches.getByRole('button', {
    name: '分支目录 feature',
    exact: true,
  });
  await featureFolder.click();
  assert.equal(
    await localBranches
      .getByRole('button', { name: '本地分支 feature/history', exact: true })
      .count(),
    0,
  );
  const branchSearch = branchSidebar.getByLabel('搜索分支或标签', { exact: true });
  await branchSearch.fill('history');
  await localBranches
    .getByRole('button', { name: '本地分支 feature/history', exact: true })
    .waitFor();
  await branchSearch.fill('');
  assert.equal(await featureFolder.getAttribute('aria-expanded'), 'false');
  await featureFolder.click();
  await localBranches.getByRole('button', { name: '本地分支 main', exact: true }).click();
  await until(
    async () => (await frame.locator('[data-commit-id]').count()) === 5,
    'Branch history was not filtered.',
  );
  assert.equal(
    await frame.locator('[data-commit-id]').first().getAttribute('data-commit-id'),
    graphRepo.merge,
  );
  assert.equal(await frame.locator(`[data-commit-id="${graphRepo.tip}"]`).count(), 0);
  assert.equal(await frame.getByRole('region', { name: '文件差异', exact: true }).count(), 0);
  await frame.locator('[data-file-id]').first().click();
  await frame.locator('[data-diff-source]').waitFor();
  await button('刷新历史').click();
  await until(
    async () => !(await button('刷新历史').isDisabled()),
    'History refresh did not finish.',
  );
  assert.equal(
    await frame.locator('[data-diff-source]').count(),
    1,
    'Same commit refresh preserves the explicit file.',
  );
  const { git } = await import('../git-review-fixture.ts');
  assert.equal(
    await git(graphRepo.repository, 'symbolic-ref', '--short', 'HEAD'),
    'feature/history',
  );
  for (const [label, ref] of [
    ['远程分支 origin/main', 'refs/remotes/origin/main'],
    ['标签 reviewed', 'refs/tags/reviewed'],
  ]) {
    const refButton = branchSidebar.getByRole('button', { name: label, exact: true });
    await refButton.click();
    await until(
      async () => (await refButton.getAttribute('aria-pressed')) === 'true',
      `Reference did not load: ${ref}`,
    );
    assert.equal(await frame.getByRole('region', { name: '文件差异', exact: true }).count(), 0);
    assert.equal(
      await frame.locator('[data-commit-id]').first().getAttribute('data-commit-id'),
      graphRepo.merge,
    );
  }
  await branchSidebar.getByRole('button', { name: 'HEAD（当前分支）', exact: true }).click();
  await until(
    async () => (await frame.locator('[data-commit-id]').count()) === 6,
    'Current branch was not restored.',
  );
  if (layoutArtifacts)
    await page.screenshot({ path: join(layoutArtifacts, 'git-log-graph-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  const graphFrame = page.frames().find((candidate) => candidate.url().endsWith('/frame.html'));
  assert.equal(
    await graphFrame.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    true,
  );
  if (layoutArtifacts)
    await page.screenshot({
      path: join(layoutArtifacts, 'git-log-graph-mobile.png'),
    });
  assert.equal((await f.events(graphPanel)).length, 0);

  // Load a real long branch, then verify windowed rendering and offscreen keyboard navigation.
  let longTip = graphRepo.tip;
  const tree = await git(graphRepo.repository, 'rev-parse', 'HEAD^{tree}');
  for (let i = 0; i < 255; i++)
    longTip = await git(
      graphRepo.repository,
      'commit-tree',
      tree,
      '-p',
      longTip,
      '-m',
      `Long history ${i}`,
    );
  await git(graphRepo.repository, 'update-ref', 'refs/heads/long-history', longTip);
  const longPanel = await f.run({
    repositories: [{ id: 'graph', path: graphRepo.repository }],
    initialView: { repositoryId: 'graph', type: 'history', branch: 'long-history' },
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(f.url(longPanel));
  await frame.locator('[data-history-count="50"]').waitFor();
  for (const size of [100, 150, 200, 250]) {
    await button('加载更多（每批 50）').click();
    await frame.locator(`[data-history-count="${size}"]`).waitFor();
  }
  const longScroll = frame.locator('[data-commit-scroll]');
  await longScroll.evaluate((el) => {
    el.scrollTop = 0;
  });
  const firstLong = frame.locator(`[data-commit-id="${longTip}"]`);
  await firstLong.waitFor();
  assert.ok(
    (await frame.locator('[data-commit-id]').count()) < 60,
    'Only visible large-history rows are mounted.',
  );
  await firstLong.focus();
  await firstLong.press('End');
  await frame.locator('[data-commit-id][aria-pressed="true"]').waitFor();
  await until(
    async () =>
      (await frame.locator('[data-commit-message]').innerText()).trim() === 'Long history 5',
    'End did not select the last loaded commit.',
  );
  const lastLong = frame.locator('[data-commit-id][aria-pressed="true"]');
  assert.equal(await lastLong.evaluate((el) => document.activeElement === el), true);
  await lastLong.press('Home');
  await until(
    async () => (await firstLong.getAttribute('aria-pressed')) === 'true',
    'Virtual history could not return to its tip.',
  );
  assert.equal(
    (await frame.locator('[data-commit-message]').innerText()).trim(),
    'Long history 254',
  );
  assert.ok((await frame.locator('[data-commit-id]').count()) < 60);
  assert.equal((await f.events(longPanel)).length, 0);
  console.log(
    'Own Git history: branch scope/no checkout, complete plain-text messages, keyboard and 250-row windowing passed.',
  );
}
if (import.meta.main) {
  const fixture = await startGitReviewFixture();
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      channel: process.env.PANEON_TEST_BROWSER_CHANNEL ?? 'chrome',
    });
    const page = await browser.newPage();
    await verifyGitLayout(fixture, page);
    console.log(
      'Git layout Chrome: aligned history, independent scrolling, long code endpoints, annotations and mobile passed.',
    );
  } finally {
    await browser?.close();
    await fixture.stop();
  }
}
