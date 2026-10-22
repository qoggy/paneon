import assert from 'node:assert/strict';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { startSkillPagesFixture } from './skill-pages-fixture.mjs';

const f = await startSkillPagesFixture();
let browser;
const artifacts = process.env.PANEON_TEST_ARTIFACTS ?? '/tmp/paneon-ui-preferences-evidence';
await mkdir(artifacts, { recursive: true });
try {
  const entry = join(f.root, 'preferences-probe.tsx');
  await writeFile(
    entry,
    `import {useState} from 'react';
import {definePanel,serverAction,useQuery,z,agent,feedbackSchema} from 'paneon/sdk';
import {Page,Input,Markdown,CodeBlock,Mermaid,FeedbackProvider,FeedbackSurface,FeedbackToolbar,FeedbackText,useUI,useFeedback} from 'paneon/ui';
import {DiffView} from './agent-skills/paneon/assets/shared/diff';
import {appendFileSync} from 'node:fs';
export const query=serverAction({kind:'query',input:z.object({}),handler:()=>{appendFileSync('preference-query-count','query\\n');return 'queried';}});
function Body(){const [draft,setDraft]=useState('');const data=useQuery(query,{});const feedback=useFeedback();const {theme,language}=useUI();return <Page title="Author title 原文"><output data-feedback className="sr-only">{JSON.stringify(feedback.value)}</output><output data-ui>{theme}/{language}</output><output data-query>{data.data}</output><Input aria-label="Author input" value={draft} onChange={e=>setDraft(e.target.value)}/><FeedbackToolbar/><FeedbackText target={{id:'source'}} text="Source 原文 🙂 unchanged"/><Markdown>{'# Author Markdown 原文\\n\\n**Strong** and [link](https://example.com)\\n\\n| A | B |\\n| - | - |\\n| 1 | 2 |'}</Markdown><CodeBlock code={'const greeting = "原文 🙂";\\n'} language="ts"/><Mermaid code={'flowchart LR\\n A[Original] --> B[源文]'}/><DiffView sourceId="fixed-source" oldPath="a.ts" newPath="a.ts" oldText={'const before = 1;\\n'} newText={'const after = 2;\\n'}/><FeedbackSurface/></Page>}
function Panel(){return <FeedbackProvider onSubmit={value=>agent.emit('feedback-submitted',value)}><Body/></FeedbackProvider>};export default definePanel({id:'preferences-probe',requires:{paneon:'0.0.0'},input:z.object({}),events:{'feedback-submitted':feedbackSchema(z.object({id:z.string()}))},render:Panel});`,
  );
  const custom = await f.service.runtime.run(entry, f.root, {}, false);
  browser = await chromium.launch({
    headless: true,
    channel: process.env.PANEON_TEST_BROWSER_CHANNEL ?? 'chrome',
  });
  const context = await browser.newContext({
    viewport: { width: 1200, height: 1000 },
    colorScheme: 'dark',
  });
  const errors = [];
  const requests = [];
  context.on('page', (page) => {
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => {
      if (request.method() === 'POST' && /\/actions\//.test(request.url()))
        requests.push(request.url());
    });
  });
  const origin = `http://127.0.0.1:${f.service.descriptor.port}`;
  const home = await context.newPage();
  await home.goto(origin);
  await home.getByRole('button', { name: 'Settings', exact: true }).click();
  const choose = await context.newPage();
  await choose.goto(f.url(f.choose));
  const cf = choose.frameLocator('iframe');
  await cf.getByRole('radio', { name: 'SQLite', exact: true }).check();
  await cf.getByRole('button', { name: 'Next', exact: true }).click();
  await cf.getByRole('checkbox', { name: 'Feature A', exact: true }).check();
  const form = await context.newPage();
  await form.goto(f.url(f.form));
  const ff = form.frameLocator('iframe');
  await ff.getByLabel('Project name', { exact: false }).fill('Original 名称');
  await ff.getByRole('radio', { name: 'Normal', exact: true }).check();
  await ff.getByRole('button', { name: 'Submit form', exact: true }).click();
  await ff
    .getByRole('status')
    .getByText(/Saved as event/)
    .waitFor();
  const probe = await context.newPage();
  await probe.goto(f.url(custom));
  const pf = probe.frameLocator('iframe');
  await pf.locator('[data-query]').getByText('queried', { exact: true }).waitFor();
  await pf.locator('[data-slot="mermaid"] svg').waitFor();
  await pf.locator('[data-shiki-token]').first().waitFor();
  await pf.getByLabel('Author input', { exact: true }).fill('Draft 输入 🙂');
  await pf.locator('[data-feedback-text]').evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = document.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });
  await pf.locator('[data-feedback-action]').click();
  await pf.getByLabel('Comment text', { exact: true }).fill('Saved 评论原文 🙂');
  await pf.getByRole('button', { name: 'Save', exact: true }).click();
  await pf.locator('[data-feedback-marker]').click();
  await pf.getByLabel('Comment text', { exact: true }).fill('Unsaved 评论 🙂');
  const beforeSrc = await probe.locator('iframe').getAttribute('src');
  const token = pf.locator('[data-shiki-token]').first();
  await token.evaluate((element) => {
    window.__originalToken = element.firstChild;
  });
  const initialColor = await token.evaluate((element) => getComputedStyle(element).color);
  const calls = requests.length;
  const initialEvents = (await f.events(f.form)).length;
  for (const [theme, language] of [
    ['light', 'en'],
    ['light', 'zh-CN'],
    ['dark', 'en'],
    ['dark', 'zh-CN'],
  ]) {
    const result = await home.evaluate(
      async (ui) =>
        (
          await fetch('/api/preferences', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ui }),
          })
        ).json(),
      { theme, language },
    );
    assert.equal(result.ok, true);
    await pf.locator('[data-ui]').getByText(`${theme}/${language}`, { exact: true }).waitFor();
    assert.equal(await cf.locator('html').getAttribute('lang'), language);
    assert.equal(await ff.locator('html').getAttribute('lang'), language);
    assert.equal(await home.locator('html').getAttribute('lang'), language);
    assert.equal(await probe.locator('iframe').getAttribute('src'), beforeSrc);
    assert.equal(
      await pf.getByLabel('Author input', { exact: true }).inputValue(),
      'Draft 输入 🙂',
    );
    assert.equal(
      await pf
        .getByRole('textbox', {
          name: language === 'en' ? 'Comment text' : '评论内容',
          exact: true,
        })
        .inputValue(),
      'Unsaved 评论 🙂',
    );
    const savedFeedback = JSON.parse(await pf.locator('[data-feedback]').textContent());
    assert.equal(savedFeedback.annotations[0].comment, 'Saved 评论原文 🙂');
    assert.equal(savedFeedback.annotations[0].targets[0].text.quote, 'Source 原文 🙂 unchanged');
    assert.equal(
      await ff.getByLabel('Project name', { exact: false }).inputValue(),
      'Original 名称',
    );
    assert.equal(
      await cf.getByRole('checkbox', { name: 'Feature A', exact: true }).isChecked(),
      true,
    );
    await ff
      .getByRole('status')
      .getByText(language === 'en' ? /Saved as event/ : /已保存为事件/)
      .waitFor();
    assert.equal(
      await token.evaluate((element) => element.firstChild === window.__originalToken),
      true,
    );
    await pf.locator('[data-slot="mermaid"] svg').waitFor();
    const markdown = await pf.locator('.markdown-body').evaluate((element) => ({
      color: getComputedStyle(element).color,
      background: getComputedStyle(element).backgroundColor,
    }));
    assert.equal(markdown.background, theme === 'dark' ? 'rgb(13, 17, 23)' : 'rgb(255, 255, 255)');
    await probe.screenshot({ path: join(artifacts, `${theme}-${language}.png`), fullPage: true });
  }
  assert.notEqual(await token.evaluate((element) => getComputedStyle(element).color), initialColor);
  assert.equal(requests.length, calls, 'Changing UI preferences must not query business actions.');
  assert.equal(
    (await f.events(f.form)).length,
    initialEvents,
    'Preference changes must not emit events.',
  );
  assert.equal((await f.events(custom)).length, 0);
  await probe.setViewportSize({ width: 390, height: 844 });
  await probe.screenshot({ path: join(artifacts, 'dark-zh-CN-narrow.png'), fullPage: true });
  assert.equal(
    await pf.locator('body').evaluate((element) => element.scrollWidth <= window.innerWidth),
    true,
  );
  // Settings persist immediately and a failed save leaves the old selected state visible.
  await home.route('**/api/preferences', async (route) => {
    if (route.request().method() === 'POST')
      return route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ ok: false, error: { message: 'Disk unavailable', code: 'TEST' } }),
      });
    return route.continue();
  });
  await home.getByRole('button', { name: '浅色', exact: true }).click();
  await home.getByText('保存失败。Disk unavailable', { exact: true }).waitFor();
  assert.equal(
    await home.getByRole('button', { name: '深色', exact: true }).getAttribute('aria-pressed'),
    'true',
  );
  await home.unroute('**/api/preferences');
  const home2 = await context.newPage();
  await home2.goto(origin);
  assert.equal(await home2.locator('html').getAttribute('class'), 'dark');
  await home2.getByRole('button', { name: '设置', exact: true }).click();
  await home2.getByRole('button', { name: 'English', exact: true }).click();
  await pf.getByRole('textbox', { name: 'Comment text', exact: true }).waitFor();
  assert.equal(
    await pf.getByRole('textbox', { name: 'Comment text', exact: true }).inputValue(),
    'Unsaved 评论 🙂',
  );
  await form.route('**/api/panels/*/events', (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ ok: false, error: { code: 'TEST', message: 'Save' } }),
    }),
  );
  await ff.getByRole('button', { name: 'Submit corrected form', exact: true }).click();
  await ff.getByText('Not saved. Save The draft is still available.', { exact: true }).waitFor();
  await home2.getByRole('button', { name: '简体中文', exact: true }).click();
  await ff.getByText('未保存。Save 草稿仍可使用。', { exact: true }).waitFor();
  await form.unroute('**/api/panels/*/events');
  const firstDark = await context.newPage();
  await firstDark.addInitScript(() => {
    window.__contentThemes = [];
    new MutationObserver(() => {
      if (document.getElementById('root')?.textContent)
        window.__contentThemes.push(document.documentElement.classList.contains('dark'));
    }).observe(document, { childList: true, subtree: true });
  });
  await firstDark.goto(f.url(custom));
  const darkFrame = firstDark.frameLocator('iframe');
  await darkFrame.getByRole('heading', { name: 'Author title 原文', exact: true }).waitFor();
  assert.equal(
    await darkFrame
      .locator('html')
      .evaluate(() => window.__contentThemes.length > 0 && window.__contentThemes.every(Boolean)),
    true,
  );
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      ok: true,
      combinations: 4,
      narrow: true,
      iframeStable: true,
      codeTextNodeStable: true,
      unsavedComment: true,
      formReceipt: true,
      queryCount: calls,
      eventCount: initialEvents,
      saveFailure: true,
      artifacts,
    }),
  );
} finally {
  await browser?.close();
  await f.stop();
}
