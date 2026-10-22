import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const exec = promisify(execFile);
const root = await mkdtemp(join(tmpdir(), 'paneon-preferences-package-'));
const cwd = new URL('..', import.meta.url).pathname;
const { stdout: registry } = await exec('npm', ['config', 'get', 'registry'], { cwd });
try {
  const { stdout: pack } = await exec(
    'npm',
    ['pack', '--ignore-scripts', '--pack-destination', root, '--json'],
    { cwd, maxBuffer: 8 * 1024 * 1024 },
  );
  const tarball = join(root, JSON.parse(pack)[0].filename);
  const install = join(root, 'installation');
  await mkdir(install);
  await writeFile(join(install, 'package.json'), '{"private":true,"type":"module"}');
  await exec(
    'npm',
    ['install', '--omit=dev', '--no-audit', '--no-fund', '--registry', registry.trim(), tarball],
    { cwd: install, timeout: 180000, maxBuffer: 8 * 1024 * 1024 },
  );
  const packageRoot = join(install, 'node_modules/paneon');
  const probe = join(install, 'probe.mjs');
  await writeFile(
    probe,
    `import assert from 'node:assert/strict';import {readFile,mkdtemp,rm} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';import {startServer} from './node_modules/paneon/dist/runtime/server.js';assert.match(await readFile('./node_modules/paneon/dist/ui/index.d.ts','utf8'),/useUI/);const en=await readFile('./node_modules/paneon/skills/paneon/assets/shared/locales/en.ts','utf8');const zh=await readFile('./node_modules/paneon/skills/paneon/assets/shared/locales/zh-CN.ts','utf8');assert.match(en,/Submit all answers/);assert.match(zh,/提交全部答案/);const home=await mkdtemp(join(tmpdir(),'paneon-installed-preferences-'));const service=await startServer(home);try{const headers={host:'127.0.0.1:'+service.descriptor.port,authorization:'Bearer '+service.descriptor.controlToken};const result=await service.app.inject({method:'POST',url:'/api/preferences',headers,payload:{ui:{theme:'dark',language:'zh-CN'}}});assert.deepEqual(result.json().data,{ui:{theme:'dark',language:'zh-CN'}});const panel=await service.runtime.run(join(process.cwd(),'node_modules/paneon/skills/paneon/assets/panels/choose/panel.tsx'),process.cwd(),{title:'Installed 原文',questions:[{id:'q',title:'Question 原文',options:[{id:'a',label:'Answer 原文'}]}]},false);assert.equal(panel.status,'running');const {chromium}=await import('${import.meta.resolve('playwright')}');const browser=await chromium.launch({headless:true,channel:'chrome'});try{const page=await browser.newPage();await page.goto('http://127.0.0.1:'+service.descriptor.port+'/panels/'+panel.instanceId);const frame=page.frameLocator('iframe');await frame.getByRole('heading',{name:'Installed 原文',exact:true}).waitFor();await frame.getByRole('button',{name:'下一题',exact:true}).waitFor();assert.equal(await frame.locator('html').getAttribute('lang'),'zh-CN');assert.equal(await frame.locator('html').getAttribute('class'),'dark');}finally{await browser.close();}console.log('Independent installed package: public UI exports, both skill dictionaries, config persistence and compiled choose in Chrome passed.');}finally{await service.stop();await rm(home,{recursive:true,force:true});}`,
  );
  const { stdout } = await exec(process.execPath, [probe], {
    cwd: install,
    timeout: 180000,
    maxBuffer: 8 * 1024 * 1024,
  });
  assert.match(stdout, /Independent installed package/);
  console.log(stdout.trim());
  const { stdout: help } = await exec(
    process.execPath,
    [join(packageRoot, 'dist/cli/index.js'), 'config', '--help'],
    { cwd: install },
  );
  assert.match(help, /set/);
} finally {
  await rm(root, { recursive: true, force: true });
}
