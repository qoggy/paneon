import assert from 'node:assert/strict';

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
    async overall(value) {
      await closeCatalog();
      await button('整体批注').click();
      await frame.getByLabel('批注内容', { exact: true }).fill(value);
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
    async locate(number, position = 1) {
      await openCatalog();
      await button(`定位批注 ${number} 的位置 ${position}`).click();
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
      assert.equal(await button('提交批注').count(), 1);
      assert.equal(await frame.locator('[data-feedback-surface]').count(), 1);
    },
  };
}
