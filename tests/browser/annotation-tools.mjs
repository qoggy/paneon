import assert from 'node:assert/strict';

/** Observe painted source positions, including scrolling and the file Sheet's slide-in. */
export async function assertAnnotationEditorOpensAfterLocate(frame, selector, openEditor) {
  const root = frame.locator('html');
  await root.evaluate((element, selector) => {
    const document = element.ownerDocument;
    const view = document.defaultView;
    const observation = {
      opened: false,
      moved: false,
      targetVisible: false,
      firstTargetVisible: false,
      stable: 0,
      frame: 0,
      first: '',
      last: '',
    };
    let previous = '';
    const sample = () => {
      const element = document.querySelector(selector);
      const target = element?.getBoundingClientRect();
      const viewport = element
        ?.closest(
          '[data-file-review-viewport], [data-diff-viewport], [data-slot="file-preview-source"]',
        )
        ?.getBoundingClientRect();
      observation.targetVisible =
        !!target &&
        target.width > 0 &&
        target.height > 0 &&
        target.right > Math.max(0, viewport?.left ?? 0) &&
        target.left < Math.min(view.innerWidth, viewport?.right ?? view.innerWidth) &&
        target.bottom > Math.max(0, viewport?.top ?? 0) &&
        target.top < Math.min(view.innerHeight, viewport?.bottom ?? view.innerHeight);
      const positions = JSON.stringify([
        view.scrollX,
        view.scrollY,
        ...[
          ...document.querySelectorAll(
            '[data-file-review-viewport], [data-diff-viewport], [data-slot="file-preview-source"]',
          ),
        ].flatMap((node) => [node.scrollLeft, node.scrollTop]),
        ...(target ? [target.x, target.y, target.width, target.height] : []),
      ]);
      observation.stable = positions === previous ? observation.stable + 1 : 0;
      previous = positions;
      if (document.querySelector('[data-annotation-editor]')) {
        if (!observation.opened) {
          observation.opened = true;
          observation.firstTargetVisible = observation.targetVisible;
          observation.first = positions;
          observation.stable = 0;
        }
        observation.moved ||= positions !== observation.first;
      }
      observation.last = positions;
      observation.frame = view.requestAnimationFrame(sample);
    };
    element.__paneonEditorLocation = observation;
    sample();
  }, selector);
  try {
    await openEditor();
    await frame.locator('[data-annotation-editor] textarea').and(frame.locator(':focus')).waitFor();
    await root.evaluate(
      (element) =>
        new Promise((resolve, reject) => {
          const view = element.ownerDocument.defaultView;
          const timeout = view.setTimeout(
            () => reject(new Error('Annotation location did not settle')),
            5000,
          );
          const check = () => {
            const state = element.__paneonEditorLocation;
            if (state.opened && state.targetVisible && state.stable >= 4) {
              view.clearTimeout(timeout);
              resolve();
            } else view.requestAnimationFrame(check);
          };
          check();
        }),
    );
    const result = await root.evaluate((element) => element.__paneonEditorLocation);
    assert.equal(result.firstTargetVisible, true, 'The target is visible when its editor opens');
    assert.equal(
      result.moved,
      false,
      `Source moved after the editor opened: ${result.first} -> ${result.last}`,
    );
  } finally {
    await root.evaluate((element) => {
      cancelAnimationFrame(element.__paneonEditorLocation.frame);
      delete element.__paneonEditorLocation;
    });
  }
}

/** Measure after native smooth scrolling settles; never change the page's scroll position. */
export async function waitForAnnotationScrollIdle(frame) {
  await frame.locator('html').evaluate(
    (element) =>
      new Promise((resolve, reject) => {
        const document = element.ownerDocument;
        const view = document.defaultView;
        let previous = '',
          stable = 0;
        const timeout = view.setTimeout(
          () => reject(new Error('Annotation scrolling did not settle')),
          5000,
        );
        const measure = () => {
          const positions = [
            view.scrollX,
            view.scrollY,
            ...[
              ...document.querySelectorAll(
                '[data-diff-viewport], [data-slot="file-preview-source"]',
              ),
            ].flatMap((node) => [node.scrollLeft, node.scrollTop]),
          ];
          const current = JSON.stringify(positions);
          stable = current === previous ? stable + 1 : 0;
          previous = current;
          if (stable === 3) {
            view.clearTimeout(timeout);
            resolve();
          } else view.requestAnimationFrame(measure);
        };
        view.requestAnimationFrame(measure);
      }),
  );
}

export async function openAnnotationDirectory(frame) {
  const trigger = frame.getByRole('button', { name: /^(批注|Annotations) \(\d+\)$/ });
  if ((await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.click();
  await frame.getByRole('dialog', { name: /^(批注目录|Annotation directory)$/ }).waitFor();
}

/** Exercise the pointer-accessible hover directory without closing the current editor. */
export async function assertEditorBlocksAnnotationNavigation(frame, number, verify) {
  const editor = frame.locator('[data-annotation-editor]');
  const input = editor.locator('textarea');
  const comment = await input.inputValue();
  const chinese = (await frame.locator('html').getAttribute('lang')) === 'zh-CN';
  const actions = chinese
    ? ['编辑批注', '定位批注', '删除批注']
    : ['Edit annotation', 'Locate annotation', 'Delete annotation'];
  for (const label of actions) {
    await editor.evaluate(async (element) => {
      await Promise.allSettled(element.getAnimations().map((animation) => animation.finished));
      const observation = { seen: false, frame: 0 };
      const measure = () => {
        observation.seen ||= element
          .getAnimations()
          .some((animation) =>
            animation.effect.getKeyframes().some((keyframe) => keyframe.translate === '-6px'),
          );
        observation.frame = requestAnimationFrame(measure);
      };
      element.__paneonShakeObservation = observation;
      measure();
    });
    const editorText = await editor.textContent();
    await frame.locator('[data-annotation-launcher] button').hover();
    const entries = await frame.locator('[data-annotation-id]').evaluateAll((elements) =>
      elements.map((element) => ({
        id: element.dataset.annotationId,
        text: element.textContent,
      })),
    );
    await frame.locator(`button[aria-label="${label} ${number}"]`).click();
    await frame
      .getByRole('dialog', { name: /^(批注目录|Annotation directory)$/ })
      .waitFor({ state: 'hidden' });
    await input.and(frame.locator(':focus')).waitFor();
    const observation = await editor.evaluate((element) => {
      const state = element.__paneonShakeObservation;
      cancelAnimationFrame(state.frame);
      delete element.__paneonShakeObservation;
      return {
        shaken: state.seen,
        reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      };
    });
    assert.equal(
      observation.shaken,
      !observation.reducedMotion,
      `${label} ${number} shake feedback`,
    );
    assert.equal(await editor.locator('[role="alert"]').count(), 0);
    assert.equal(
      await editor.textContent(),
      editorText,
      'Blocked navigation adds no explanatory copy',
    );
    assert.equal(
      await input.inputValue(),
      comment,
      `${label} ${number} preserves the unsaved input`,
    );
    await verify?.(`${label} ${number}`);
    await frame.locator('[data-annotation-launcher] button').hover();
    assert.deepEqual(
      await frame.locator('[data-annotation-id]').evaluateAll((elements) =>
        elements.map((element) => ({
          id: element.dataset.annotationId,
          text: element.textContent,
        })),
      ),
      entries,
      `${label} ${number} preserves every saved annotation`,
    );
    await input.hover();
    await frame
      .getByRole('dialog', { name: /^(批注目录|Annotation directory)$/ })
      .waitFor({ state: 'hidden' });
  }
}

export async function submitAnnotations(frame) {
  const submit = frame.getByRole('button', { name: /^(提交批注|Submit annotations)$/ });
  await openAnnotationDirectory(frame);
  await submit.click();
  await frame
    .getByRole('dialog', { name: /^(批注目录|Annotation directory)$/ })
    .waitFor({ state: 'hidden' });
}

/** Drive the real contextual UI; no store injection or synthetic annotation state. */
export function annotationTools(frame, page) {
  const button = (name) => frame.getByRole('button', { name, exact: true });
  const catalog = frame.getByLabel('批注目录', { exact: true });
  const catalogButton = frame.getByRole('button', { name: /^批注 \(\d+\)$/ });
  async function closeCatalog() {
    if (
      (await catalogButton.count()) &&
      (await catalogButton.getAttribute('aria-expanded')) === 'true'
    )
      await page.keyboard.press('Escape');
    await catalog.waitFor({ state: 'hidden' });
  }
  async function openCatalog() {
    if ((await catalogButton.getAttribute('aria-expanded')) !== 'true') await catalogButton.click();
    await catalog.waitFor({ state: 'visible' });
  }
  return {
    async count() {
      if (!(await catalogButton.count())) return 0;
      return Number((await catalogButton.textContent()).match(/\((\d+)\)/)[1]);
    },
    async write(value) {
      const input = frame.getByLabel('批注内容', { exact: true });
      if (!(await input.isVisible())) await button('批注').click();
      await input.fill(value);
    },
    async save() {
      if (!(await frame.getByLabel('批注内容', { exact: true }).isVisible()))
        await button('批注').click();
      await button('保存').click();
    },
    async edit(number) {
      await openCatalog();
      await button(`编辑批注 ${number}`).click();
      // Escape closes Radix before editing, but must not cancel the editor.
      // Clicking the editor dismisses the nonmodal catalog without changing its draft.
      await frame.getByLabel('批注内容', { exact: true }).click();
      await catalog.waitFor({ state: 'hidden' });
    },
    async locate(number) {
      await openCatalog();
      await button(`定位批注 ${number}`).click();
      await closeCatalog();
    },
    async remove(number) {
      await this.edit(number);
      await button('删除批注').click();
    },
    async text(number) {
      await this.edit(number);
      const value = await frame.getByLabel('批注内容', { exact: true }).inputValue();
      await frame.getByLabel('批注内容', { exact: true }).press('Escape');
      return value;
    },
    async assertNoLegacySection() {
      assert.equal(await frame.getByText('选择与批注', { exact: false }).count(), 0);
      assert.equal(await frame.getByRole('list', { name: '批注条目' }).count(), 0);
      assert.equal(await catalogButton.count(), 1);
      assert.equal(await frame.locator('[data-annotation-surface]').count(), 1);
    },
  };
}

/** Select rendered text; offsets traverse syntax spans without modifying source DOM. */
export async function selectAnnotationText(
  frame,
  selector,
  start = 0,
  end,
  endSelector = selector,
) {
  const first = frame.locator(selector).first();
  await first.scrollIntoViewIfNeeded();
  const last = frame.locator(endSelector).last();
  await last.scrollIntoViewIfNeeded();
  await first.evaluate(
    (element, { start, end, endSelector }) => {
      document.activeElement?.blur();
      const last = [...document.querySelectorAll(endSelector)].at(-1);
      const boundary = (root, offset) => {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        let node,
          remaining = offset;
        while ((node = walker.nextNode())) {
          if (remaining <= node.data.length) return { node, offset: remaining };
          remaining -= node.data.length;
        }
        throw new Error('Requested selection exceeds rendered text');
      };
      const from = boundary(element, start);
      const to = boundary(last, end ?? last.textContent.length);
      const range = document.createRange();
      range.setStart(from.node, from.offset);
      range.setEnd(to.node, to.offset);
      const selection = document.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      last.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    },
    { start, end, endSelector },
  );
  await frame.locator('[data-annotation-action]').waitFor();
}

export async function selectDiffLines(frame, side, first, last = first) {
  await selectAnnotationText(
    frame,
    `[data-code-side="${side}"][data-line="${first}"]`,
    0,
    undefined,
    `[data-code-side="${side}"][data-line="${last}"]`,
  );
}
