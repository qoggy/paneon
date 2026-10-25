import { cp, mkdtemp, mkdir, writeFile, readFile, rm, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
export async function startGithubPRFixture() {
  const root = await mkdtemp(join(tmpdir(), 'paneon-pr-'));
  const statePath = join(root, 'fixture-state.json'),
    callsPath = join(root, 'gh-calls.jsonl'),
    bin = join(root, 'bin');
  const previousPath = process.env.PATH;
  let service;
  try {
    await mkdir(bin);
    await writeFile(statePath, '{}');
    await writeFile(callsPath, '');
    const helper = new URL('../github-pr-fixture.ts', import.meta.url).href;
    const runner = `#!${process.execPath}\nimport { readFile, appendFile } from 'node:fs/promises';\nimport { routeGh } from ${JSON.stringify(helper)};\nconst args=process.argv.slice(2);\nawait appendFile(${JSON.stringify(callsPath)}, JSON.stringify(args)+'\\n');\ntry { const state=JSON.parse(await readFile(${JSON.stringify(statePath)},'utf8')); console.log(JSON.stringify(routeGh(args,state))); } catch(error) { console.error(error.message); process.exitCode=1; }\n`;
    await writeFile(join(bin, 'gh'), runner);
    await chmod(join(bin, 'gh'), 0o755);
    process.env.PATH = `${bin}:${previousPath}`;
    const { startServer } = await import(new URL('../runtime-fixture.ts', import.meta.url).href);
    const skill = join(root, 'agent-skills/paneon');
    await cp(
      process.env.PANEON_TEST_SKILL_SOURCE ?? new URL('../../skills/paneon', import.meta.url),
      skill,
      { recursive: true },
    );
    service = await startServer(join(root, '.paneon'));
    await service.app.inject({
      method: 'POST',
      url: '/api/preferences',
      headers: {
        host: `127.0.0.1:${service.descriptor.port}`,
        authorization: `Bearer ${service.descriptor.controlToken}`,
      },
      payload: { ui: { language: 'zh-CN' } },
    });
    const params = { repository: 'example/project', initialPullRequest: 101 };
    const run = (input = params) =>
      service.runtime.run(join(skill, 'assets/examples/github-pr/panel.tsx'), root, input, false);
    const panel = await run();
    return {
      root,
      service,
      skill,
      params,
      panel,
      run,
      url: (p = panel) => `http://127.0.0.1:${service.descriptor.port}/panels/${p.instanceId}`,
      async state(value) {
        await writeFile(statePath, JSON.stringify(value));
      },
      async calls() {
        return (await readFile(callsPath, 'utf8')).split('\n').filter(Boolean).map(JSON.parse);
      },
      async events(p = panel) {
        return (await service.runtime.events(p.instanceId, 'acceptance', 100, 0)).events;
      },
      async stop() {
        await service.stop();
        process.env.PATH = previousPath;
        await rm(root, { recursive: true, force: true });
      },
    };
  } catch (error) {
    await service?.stop();
    process.env.PATH = previousPath;
    await rm(root, { recursive: true, force: true });
    throw error;
  }
}
