import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** Isolate test listeners while retaining explicitly configured port/error scenarios. */
export function prepareRuntimeHome(home: string): string {
  const path = join(home, 'config.json');
  const config = (existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {}) as {
    server?: { port?: number; [key: string]: unknown };
    [key: string]: unknown;
  };
  if (config.server?.port === undefined) {
    mkdirSync(home, { recursive: true });
    writeFileSync(path, JSON.stringify({ ...config, server: { ...config.server, port: 0 } }));
  }
  return home;
}

/** Package acceptance can select the independently installed runtime with the same fixture. */
export async function startServer(
  ...args: Parameters<typeof import('../src/runtime/server.js').startServer>
): Promise<Awaited<ReturnType<typeof import('../src/runtime/server.js').startServer>>> {
  const home = prepareRuntimeHome(args[0] ?? join(homedir(), '.paneon'));
  const runtime = (await import(
    process.env.PANEON_TEST_RUNTIME_ENTRY ??
      new URL('../dist/runtime/server.js', import.meta.url).href
  )) as typeof import('../src/runtime/server.js');
  return runtime.startServer(home, args[1]);
}
