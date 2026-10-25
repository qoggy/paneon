import { PACKAGE_VERSION } from '../../dist/shared/paths.js';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export async function startMultipleTabsFixture() {
  const { startServer } = await import(new URL('../runtime-fixture.ts', import.meta.url).href);
  const root = await mkdtemp(join(tmpdir(), 'paneon-multiple-tabs-'));
  const entry = join(root, 'panel.tsx');
  const calls = join(root, 'calls.txt');
  const source = (title) => `
import { useState } from 'react';
import { appendFileSync } from 'node:fs';
import { definePanel, serverAction, z } from '@qoggy/paneon/sdk';
import { Button, Page } from '@qoggy/paneon/ui';
export const run = serverAction({kind:'mutation',input:z.object({}),handler:async()=>{
  appendFileSync(${JSON.stringify(calls)}, 'call\\n'); return {done:true};
}});
function Panel(){const [done,setDone]=useState(false);return <Page title=${JSON.stringify(title)}>
<p>Multiple tabs share the same browser connection pool.</p>
<Button onClick={async()=>{await run({});setDone(true);}}>Run test action</Button>
{done&&<p>Action completed</p>}</Page>;}
export default definePanel({id:'multiple-tabs',requires:{paneon:'${PACKAGE_VERSION}'},input:z.object({}),render:Panel});`;
  await writeFile(entry, source('Multiple tabs original'));
  const service = await startServer(join(root, 'data'));
  try {
    const panel = await service.runtime.run(entry, root, {}, true);
    return {
      service,
      root,
      entry,
      panel,
      url: `http://127.0.0.1:${service.descriptor.port}/panels/${panel.instanceId}`,
      update: () => writeFile(entry, source('Multiple tabs updated')),
      async mutationCount() {
        try {
          return (await readFile(calls, 'utf8')).trim().split('\n').length;
        } catch (error) {
          if (error.code === 'ENOENT') return 0;
          throw error;
        }
      },
      async stop() {
        await service.stop();
        await rm(root, { recursive: true, force: true });
      },
    };
  } catch (error) {
    await service.stop();
    await rm(root, { recursive: true, force: true });
    throw error;
  }
}
