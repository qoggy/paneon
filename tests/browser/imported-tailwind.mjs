import { PACKAGE_VERSION } from '../../dist/shared/paths.js';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { startServer } from '../runtime-fixture.ts';

// Match a separately installed skill: panels/example imports ../../shared, outside
// the entry directory. No repository ancestor or shared source directory is scanned.
const root = await mkdtemp(join(tmpdir(), 'paneon-imported-tailwind-'));
const entry = join(root, 'installed/assets/panels/example/panel.tsx');
const shared = join(root, 'installed/assets/shared');
let service, browser;
// Generate candidates after the package theme build so tests cannot seed that
// theme's automatic scan and mask a missing imported-source utility.
const unusedColor = randomBytes(3).toString('hex');
const serverColor = randomBytes(3).toString('hex');
const serverClass = `bg-[#${serverColor}]`;
const legacy = (width) =>
  `export function LegacyRows(){return <table data-legacy className="border-[${width}px]"><tbody><tr><td className="bg-green-50">added</td><td className="bg-red-50">removed</td></tr></tbody></table>}`;
async function until(check, description) {
  const end = Date.now() + 60000;
  while (Date.now() < end) {
    if (await check()) return;
    await delay(50);
  }
  throw new Error(description);
}
try {
  await mkdir(join(root, 'installed/assets/panels/example'), { recursive: true });
  await cp(new URL('../../skills/paneon/assets/shared/', import.meta.url), shared, {
    recursive: true,
  });
  await writeFile(join(shared, 'legacy.tsx'), legacy(13));
  await writeFile(join(shared, 'unused.tsx'), `export const unused = "bg-[#${unusedColor}]";`);
  await writeFile(
    join(shared, 'server.ts'),
    `export function secret(){return ${JSON.stringify(serverClass)};}`,
  );
  await writeFile(
    entry,
    `
import {useState} from 'react';
import {definePanel,serverAction,z} from '@qoggy/paneon/sdk';
import {Button,AnnotationRoot} from '@qoggy/paneon/ui';
import {LegacyRows} from '../../shared/legacy.tsx';
import {DiffView} from '../../shared/diff.tsx';
import {secret} from '../../shared/server.ts';
export const serverOnly=serverAction({kind:'query',input:z.object({}),handler:()=>secret()});
function Panel(){const [visible,setVisible]=useState(true);return <AnnotationRoot onSubmit={async()=>{}} adapter={{resolve:()=>({status:'ready',text:''}),locate:()=>{}}}><LegacyRows/><Button onClick={()=>setVisible(!visible)}>Toggle diff</Button>{visible&&<DiffView annotationTargets={{old:"fixture-old",new:"fixture-new"}} oldPath="file.ts" newPath="file.ts" oldText={'const before = 1;\\n'} newText={'const after = 2;\\n'}/>}</AnnotationRoot>}
export default definePanel({id:'imported-tailwind',requires:{paneon:'${PACKAGE_VERSION}'},input:z.object({}),render:Panel});`,
  );
  service = await startServer(join(root, 'data'));
  const panel = await service.runtime.run(entry, root, {}, true);
  browser = await chromium.launch({
    headless: true,
    channel: process.env.PANEON_TEST_BROWSER_CHANNEL ?? 'chrome',
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${service.descriptor.port}/panels/${panel.instanceId}`);
  const frame = page.frameLocator('iframe');
  await frame.locator('[data-legacy] td').first().waitFor();
  const legacyColors = await frame
    .locator('[data-legacy] td')
    .evaluateAll((cells) => cells.map((cell) => getComputedStyle(cell).backgroundColor));
  for (const color of legacyColors)
    assert.ok(
      color !== 'rgba(0, 0, 0, 0)' && color !== 'rgb(255, 255, 255)',
      `Imported legacy utility must produce a colored background: ${color}`,
    );
  assert.notEqual(legacyColors[0], legacyColors[1]);
  assert.equal(
    await frame
      .locator('[data-legacy]')
      .evaluate((element) => getComputedStyle(element).borderTopWidth),
    '13px',
  );
  const artifacts = process.env.PANEON_TEST_ARTIFACTS ?? '/tmp/paneon-imported-tailwind-evidence';
  await mkdir(artifacts, { recursive: true });
  const evidence = [];
  for (const theme of ['light', 'dark']) {
    await page.evaluate(
      (theme) =>
        fetch('/api/preferences', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ui: { theme, language: 'en' } }),
        }),
      theme,
    );
    await frame.locator(`html[data-theme="${theme}"]`).waitFor();
    for (const mode of ['split', 'unified']) {
      if (mode === 'unified')
        await frame.getByRole('button', { name: 'Unified', exact: true }).click();
      const colors = await frame.locator('[data-code-side]').evaluateAll((elements) =>
        elements.map((element) => {
          const cell = element.closest('td');
          const style = getComputedStyle(cell);
          return {
            side: element.dataset.codeSide,
            color: style.backgroundColor,
            expected: (() => {
              const probe = document.createElement('span');
              probe.style.backgroundColor = `var(--diff-${element.dataset.codeSide === 'old' ? 'deletion' : 'addition'})`;
              document.body.append(probe);
              const color = getComputedStyle(probe).backgroundColor;
              probe.remove();
              return color;
            })(),
          };
        }),
      );
      assert.ok(colors.some((item) => item.side === 'old'));
      assert.ok(colors.some((item) => item.side === 'new'));
      for (const item of colors) assert.equal(item.color, item.expected, JSON.stringify(item));
      assert.notEqual(
        colors.find((item) => item.side === 'old').color,
        colors.find((item) => item.side === 'new').color,
      );
      evidence.push({ theme, mode, colors });
      await page.screenshot({ path: join(artifacts, `${theme}-${mode}.png`), fullPage: true });
    }
    await frame.getByRole('button', { name: 'Side by side', exact: true }).click();
  }
  // Changes to the imported source stay in the revision/watch graph.
  await writeFile(join(shared, 'legacy.tsx'), legacy(14));
  await until(
    () => service.runtime.inspect(panel.instanceId).revision !== panel.revision,
    'Imported component save did not produce a new revision',
  );
  await until(
    async () =>
      (await frame
        .locator('[data-legacy]')
        .evaluate((element) => getComputedStyle(element).borderTopWidth)) === '14px',
    'Imported component utility did not update after watch rebuild',
  );
  const updated = service.runtime.inspect(panel.instanceId);
  const compiled = service.runtime.live.get(panel.instanceId).compiled;
  const css = (
    await Promise.all(
      compiled.manifest.assets
        .filter((asset) => asset.endsWith('.css'))
        .map((asset) => readFile(join(compiled.directory, 'client', asset), 'utf8')),
    )
  ).join('\n');
  assert.ok(compiled.manifest.dependencies.includes(await realpath(join(shared, 'legacy.tsx'))));
  assert.equal(
    await service.runtime.invoke(panel.instanceId, updated.revision, 'panel.tsx#serverOnly', {}),
    serverClass,
  );
  const packageTheme = await readFile(new URL('../../dist/ui/theme.css', import.meta.url), 'utf8');
  assert.ok(
    !packageTheme.includes(unusedColor) && !packageTheme.includes(serverColor),
    'Negative scan candidates must be absent from the prebuilt package theme',
  );
  assert.ok(
    !css.includes(unusedColor),
    'Unimported sibling source must not enter the Tailwind scan',
  );
  assert.ok(!css.includes(serverColor), 'Server-only source must not enter the Tailwind scan');
  assert.deepEqual(errors, []);
  const result = {
    ok: true,
    legacyColors,
    watchRevisionChanged: updated.revision !== panel.revision,
    errors,
    evidence,
  };
  await writeFile(join(artifacts, 'result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally {
  await browser?.close();
  await service?.stop();
  await rm(root, { recursive: true, force: true });
}
