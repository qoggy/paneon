import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { Runtime } = (await import(
  '../dist/' + 'runtime/lifecycle.js'
)) as typeof import('../src/runtime/lifecycle.js');

void test('page-defined annotation references compile and execute in server actions', async () => {
  const root = await mkdtemp(join(tmpdir(), 'paneon-sdk-file-annotations-'));
  const runtime = new Runtime(join(root, 'runtime'));
  const ref = 'source:/source.ts@original';
  try {
    const entry = join(root, 'panel.tsx');
    await writeFile(
      entry,
      `import {definePanel,serverAction,z,annotationValueSchema} from '@qoggy/paneon/sdk';
import type {AnnotationValue} from '@qoggy/paneon/sdk';
const ref=${JSON.stringify(ref)};
export const check=serverAction({kind:'query',input:annotationValueSchema(z.string()),handler:(_ctx,input)=>input.annotations[0].targets[0].ref});
const value:AnnotationValue<string>={annotations:[{id:'file',comment:'',targets:[{ref}]}]};
function Panel(){return <button onClick={()=>check(value)}>Check file</button>}
export default definePanel({id:'sdk-file-annotations',requires:{paneon:'*'},input:z.object({}),render:Panel});`,
    );
    const panel = await runtime.run(entry, root, {}, false);
    assert.equal(
      await runtime.invoke(panel.instanceId, panel.revision, 'panel.tsx#check', {
        annotations: [{ id: 'file', comment: '', targets: [{ ref }] }],
      }),
      ref,
    );
  } finally {
    await runtime.stop();
    await rm(root, { recursive: true, force: true });
  }
});
