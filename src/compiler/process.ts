import { fork } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { join } from 'node:path';
import { readdirSync, rmSync, existsSync } from 'node:fs';
import { PACKAGE_ROOT } from '../shared/paths.js';
import { PaneonError } from '../shared/types.js';
import type { Diagnostic, WatchInputs } from '../shared/types.js';
import type { CompiledPanel } from './index.js';

// Compilation is CPU-bound. Keep it outside the HTTP process so health/control
// requests remain responsive while TypeScript and Vite analyze author source.
export class CompilerProcess {
  readonly child: ChildProcess;
  readonly result: Promise<CompiledPanel>;
  watchInputs?: WatchInputs;
  private cancelled = false;
  private panelRoot: string;

  constructor(entryPath: string, panelRoot: string) {
    this.panelRoot = panelRoot;
    this.child = fork(join(PACKAGE_ROOT, 'dist/compiler/worker.js'), [], {
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      execArgv: [],
      // Vite's watch server sets the daemon's NODE_ENV to development. Static
      // panel builds must choose production independently of that inherited value.
      env: { ...process.env, NODE_ENV: 'production' },
    });
    this.result = new Promise((resolve, reject) => {
      let output: CompiledPanel | undefined;
      let failure: Diagnostic | undefined;
      this.child.on('message', (raw: unknown) => {
        const message = raw as {
          ok: boolean;
          data?: CompiledPanel;
          error?: Diagnostic;
          watchInputs?: WatchInputs;
        };
        this.watchInputs = message.watchInputs;
        if (message.ok && message.data) output = message.data;
        else if (message.error) failure = message.error;
      });
      this.child.once('error', () =>
        reject(new PaneonError('BUILD_FAILED', 'The compiler process could not start.')),
      );
      this.child.once('exit', (code) => {
        if (this.cancelled || failure || code !== 0 || !output) {
          try {
            this.cleanup();
          } catch {
            reject(
              new PaneonError('BUILD_FAILED', 'Temporary build artifacts could not be removed.'),
            );
            return;
          }
        }
        if (this.cancelled)
          reject(new PaneonError('BUILD_CANCELLED', 'The panel build was cancelled.'));
        else if (failure) reject(new PaneonError(failure.code, failure.message, failure.details));
        else if (code === 0 && output) resolve(output);
        else
          reject(
            new PaneonError(
              'BUILD_FAILED',
              'The compiler process stopped before completing the build.',
            ),
          );
      });
      this.child.send({ entryPath, panelRoot }, (error) => {
        if (error)
          reject(new PaneonError('BUILD_FAILED', 'The compiler process could not be contacted.'));
      });
    });
  }

  private cleanup() {
    if (!existsSync(this.panelRoot)) return;
    for (const entry of readdirSync(this.panelRoot, { withFileTypes: true }))
      if (entry.isDirectory() && /^sha256-[a-f0-9]{64}-build$/.test(entry.name))
        rmSync(join(this.panelRoot, entry.name), { recursive: true, force: true });
  }
  async stop() {
    this.cancelled = true;
    if (!this.child.pid || this.child.exitCode !== null || this.child.signalCode !== null) return;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => this.child.kill('SIGKILL'), 1000);
      this.child.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
      this.child.kill('SIGTERM');
    });
  }
}
