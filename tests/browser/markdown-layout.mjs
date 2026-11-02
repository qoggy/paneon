import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { PACKAGE_VERSION } from '../panel-fixture.ts';
import { startServer } from '../runtime-fixture.ts';

const root = await mkdtemp(join(tmpdir(), 'paneon-markdown-layout-'));
let service, browser;
try {
  const entry = join(root, 'panel.tsx');
  await writeFile(
    entry,
    `
import { useState } from 'react';
import { definePanel, z } from '@qoggy/paneon/sdk';
import { Button, Markdown, Page, Tabs, TabsContent, TabsList, TabsTrigger } from '@qoggy/paneon/ui';

function Panel() {
  const [count, setCount] = useState(1);
  const source = count === 0 ? 'Introduction.' : '# Introduction\\n\\nIntroduction.' + (count === 2 ? '\\n\\n## Details\\n\\nDetails.' : '');
  return <Page>
    <Markdown className="layout-introduction">{source}</Markdown>
    <Tabs defaultValue="first">
      <TabsList><TabsTrigger value="first">First</TabsTrigger><TabsTrigger value="second">Second</TabsTrigger></TabsList>
      <TabsContent value="first">First content</TabsContent>
      <TabsContent value="second">Second content</TabsContent>
    </Tabs>
    {[0, 1, 2].map(value => <Button key={value} onClick={() => setCount(value)}>{value} headings</Button>)}
  </Page>;
}
export default definePanel({ id: 'markdown-layout', requires: { paneon: '${PACKAGE_VERSION}' }, input: z.object({}), render: Panel });
`,
  );
  service = await startServer(join(root, 'runtime'));
  const panel = await service.runtime.run(entry, root, {}, false);
  browser = await chromium.launch({
    headless: true,
    channel: process.env.PANEON_TEST_BROWSER_CHANNEL ?? 'chrome',
  });
  for (const { theme, width, outlineMode } of [
    { theme: 'light', width: 1176, outlineMode: 'sidebar' },
    { theme: 'dark', width: 1000, outlineMode: 'popup' },
  ]) {
    const response = await service.app.inject({
      method: 'POST',
      url: '/api/preferences',
      headers: {
        host: `127.0.0.1:${service.descriptor.port}`,
        authorization: `Bearer ${service.descriptor.controlToken}`,
      },
      payload: { ui: { theme } },
    });
    assert.equal(response.statusCode, 200);
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${service.descriptor.port}/panels/${panel.instanceId}`);
    const frame = page.frameLocator('iframe');
    await frame.getByRole('heading', { name: 'Introduction', exact: true }).waitFor();
    const inner = page.frames().find((item) => item.parentFrame());
    assert.equal(
      await frame.locator('html').evaluate((el) => el.classList.contains('dark')),
      theme === 'dark',
    );
    const markdown = frame.locator('.layout-introduction');
    const gap = await markdown.evaluate(
      (root) =>
        document.querySelector('[data-slot="tabs"]').getBoundingClientRect().top -
        root.getBoundingClientRect().bottom,
    );
    assert.equal(gap, 32, `${theme}: Markdown must preserve Page's 32px spacing.`);
    for (const count of [1, 0, 2, 1]) {
      await frame.getByRole('button', { name: `${count} headings`, exact: true }).click();
      await inner.waitForFunction(
        ({ count, mode }) => {
          const root = document.querySelector('.layout-introduction');
          return root.querySelectorAll('h1,h2').length === count && root.dataset.tocMode === mode;
        },
        { count, mode: count === 2 ? outlineMode : 'none' },
      );
      const dimensions = await markdown.evaluate((root) => ({
        root: root.getBoundingClientRect().width,
        content: root.querySelector('[data-markdown-content]').getBoundingClientRect().width,
        firstMargin: getComputedStyle(
          root.querySelector('[data-markdown-content]').firstElementChild,
        ).marginTop,
      }));
      assert.equal(
        dimensions.firstMargin,
        '0px',
        'The first content block keeps its internal reset.',
      );
      if (count < 2) {
        assert.equal(
          dimensions.content,
          dimensions.root,
          'No outline must reserve no sidebar width.',
        );
        assert.equal(await markdown.locator('[data-toc-sidebar], [data-toc-trigger]').count(), 0);
      } else {
        await markdown
          .locator(outlineMode === 'sidebar' ? '[data-toc-sidebar]' : '[data-toc-trigger]')
          .waitFor();
      }
    }
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log(
    'Markdown layout passed: light/dark Page spacing, zero/single/multiple headings, sidebar/popup, full content width, and outline removal after a source update.',
  );
} finally {
  await browser?.close();
  await service?.stop();
  await rm(root, { recursive: true, force: true });
}
