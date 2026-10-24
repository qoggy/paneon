import assert from 'node:assert/strict';

export async function openAnnotationDirectory(frame) {
  const trigger = frame.getByRole('button', { name: /^(批注|Annotations) \(\d+\)$/ });
  if ((await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.click();
  await frame.getByRole('dialog', { name: /^(批注目录|Annotation directory)$/ }).waitFor();
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
      await button('取消').click();
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
  await frame.getByRole('button', { name: /^(批注|Annotation)$/, exact: true }).waitFor();
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
