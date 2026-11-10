import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import type { Diagnostic } from '../src/shared/types.js';

type Evidence = {
  error: Diagnostic;
  readFailures: { file: string; code: string; message: string }[];
  resolutions: { importer: string; modules: { name: string; file: string | null }[] }[];
  probes: Record<string, string>[];
  files: { path: string; text: string }[];
};

void test('compiler failure evidence preserves actual reads and resolution across worker IPC', async () => {
  const root = realpathSync(await mkdtemp(join(tmpdir(), 'paneon-input-trace-')));
  const repository = realpathSync(new URL('../', import.meta.url));
  const entry = join(root, 'panel.tsx');
  const blocked = ['accordion.d.ts', 'layout.d.ts'].map((file) =>
    join(repository, 'dist/ui', file),
  );
  const hook = `import fs from 'node:fs';import {syncBuiltinESMExports} from 'node:module';
const original=fs.readFileSync;
fs.readFileSync=function(file,...args){
  if(${JSON.stringify(blocked)}.includes(String(file)))
    throw Object.assign(new Error('Injected declaration read failure'),{code:'EACCES'});
  return original.call(this,file,...args);
};syncBuiltinESMExports();`;
  try {
    await writeFile(
      entry,
      `import {definePanel,z} from '@qoggy/paneon/sdk';
import {Accordion,AccordionContent,AccordionItem,AccordionTrigger,Page,Section,Stack} from '@qoggy/paneon/ui';
void [Accordion,AccordionContent,AccordionItem,AccordionTrigger,Page,Section,Stack];
export default definePanel({id:'input-trace',requires:{paneon:'*'},input:z.object({}),render:()=> <p>Ready</p>});`,
    );
    const { stdout } = await promisify(execFile)(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `import {CompilerProcess} from ${JSON.stringify(pathToFileURL(join(repository, 'dist/compiler/process.js')).href)};
const compiler=new CompilerProcess(${JSON.stringify(entry)},${JSON.stringify(join(root, 'output'))});
try{await compiler.result;throw new Error('Expected compilation to fail');}
catch(error){console.log(JSON.stringify({code:error.code,message:error.message,details:error.details}));}`,
      ],
      {
        timeout: 60_000,
        env: {
          ...process.env,
          PANEON_TEST_ARTIFACTS: root,
          NODE_OPTIONS: [
            process.env.NODE_OPTIONS,
            `--import=data:text/javascript,${encodeURIComponent(hook)}`,
            `--import=${new URL('./fixtures/compiler-input-trace.mjs', import.meta.url).href}`,
          ]
            .filter(Boolean)
            .join(' '),
        },
      },
    );
    const diagnostic = JSON.parse(stdout) as Diagnostic;
    assert.equal(diagnostic.code, 'BUILD_FAILED');
    assert.equal(diagnostic.details?.stage, 'typecheck');
    assert.match(diagnostic.message, /has no exported member 'Accordion'/);
    assert.match(diagnostic.message, /has no exported member 'Page'/);
    const traces = (await readdir(root)).filter((file) => /^compiler-inputs-\d+\.json$/.test(file));
    assert.equal(traces.length, 1);
    const evidence = JSON.parse(await readFile(join(root, traces[0]), 'utf8')) as Evidence;
    assert.deepEqual(evidence.error, diagnostic);
    assert.deepEqual(
      evidence.readFailures.map(({ file, code }) => ({ file, code })),
      blocked.map((file) => ({ file, code: 'EACCES' })),
    );
    const index = join(repository, 'dist/ui/index.d.ts');
    const resolutions = evidence.resolutions.find(({ importer }) => importer === index)?.modules;
    assert.ok(resolutions);
    for (const file of blocked) {
      assert.ok(resolutions.some((resolution) => resolution.file === file));
      assert.equal(evidence.probes[0][file], 'file');
      assert.equal(
        evidence.files.some((input) => input.path === file),
        false,
      );
    }
    assert.match(
      evidence.files.find((input) => input.path === index)?.text ?? '',
      /export \* from '\.\/accordion'/,
    );
    assert.equal(
      evidence.files.find((input) => input.path === entry)?.text,
      await readFile(entry, 'utf8'),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
