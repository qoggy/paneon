import { execFile, fork } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { join } from 'node:path';
import { readdirSync, rmSync, existsSync } from 'node:fs';
import { promisify } from 'node:util';
import { PACKAGE_ROOT } from '../shared/paths.js';
import { PaneonError } from '../shared/types.js';
import { buildError, stderrTail } from './diagnostics.js';
import type { Diagnostic, WatchInputs } from '../shared/types.js';
import type { CompiledPanel } from './index.js';

// Compilation is CPU-bound. Keep it outside the HTTP process so health/control
// requests remain responsive while TypeScript and Vite analyze author source.
export class CompilerProcess {
  readonly child: ChildProcess;
  readonly result: Promise<CompiledPanel>;
  watchInputs?: WatchInputs;
  private termination?: PaneonError;
  private terminating?: Promise<void>;
  private closed: Promise<void>;
  private deadline?: NodeJS.Timeout;
  private panelRoot: string;

  constructor(entryPath: string, panelRoot: string, timeoutMs = 60000) {
    this.panelRoot = panelRoot;
    this.child = fork(join(PACKAGE_ROOT, 'dist/compiler/worker.js'), [], {
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
      execArgv: [],
      // Own a process group so hard termination also reaches metadata workers.
      detached: process.platform !== 'win32',
      // Vite's watch server sets the daemon's NODE_ENV to development. Static
      // panel builds must choose production independently of that inherited value.
      env: { ...process.env, NODE_ENV: 'production' },
    });
    this.closed = new Promise((resolve) => this.child.once('close', () => resolve()));
    this.result = new Promise((resolve, reject) => {
      const stderr = stderrTail();
      this.child.stderr?.on('data', (chunk: Buffer) => stderr.write(chunk));
      let output: CompiledPanel | undefined;
      let failure: Diagnostic | undefined;
      this.deadline = setTimeout(() => {
        this.termination ??= new PaneonError('BUILD_TIMEOUT', 'Panel compilation timed out.', {
          stage: 'process',
          entryPath,
          timeoutMs,
          ...stderr.read(),
        });
        this.terminating = this.kill('SIGKILL');
      }, timeoutMs);
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
      this.child.once('error', (error) => {
        failure = buildError(error, 'process', entryPath);
      });
      this.child.once('close', (code, signal) => {
        clearTimeout(this.deadline);
        // Windows taskkill can still be finishing descendant cleanup after close.
        void this.finish().then(() => {
          if (this.termination || failure || code !== 0 || !output) {
            try {
              this.cleanup();
            } catch (error) {
              console.warn('Could not remove failed compiler output.', error);
            }
          }
          if (this.termination) reject(this.termination);
          else if (failure) reject(new PaneonError(failure.code, failure.message, failure.details));
          else if (code === 0 && output) resolve(output);
          else
            reject(
              new PaneonError(
                'BUILD_FAILED',
                'The compiler process stopped before completing the build.',
                {
                  stage: 'process',
                  entryPath,
                  exitCode: code,
                  ...(signal ? { signal } : {}),
                  ...stderr.read(),
                },
              ),
            );
        }, reject);
      });
      this.child.send({ entryPath, panelRoot }, (error) => {
        if (error) {
          void this.stop(buildError(error, 'process', entryPath)).catch(reject);
        }
      });
    });
  }

  private async kill(signal: NodeJS.Signals) {
    const pid = this.child.pid;
    if (!pid) return;
    if (process.platform === 'win32') {
      await promisify(execFile)('taskkill', ['/PID', String(pid), '/T', '/F']);
    } else {
      try {
        process.kill(-pid, signal);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
      }
    }
  }

  private async finish() {
    await this.terminating;
    // A compiler that exits before metadata must not leave its process group alive.
    if (process.platform !== 'win32') await this.kill('SIGKILL');
  }

  private cleanup() {
    if (!existsSync(this.panelRoot)) return;
    for (const entry of readdirSync(this.panelRoot, { withFileTypes: true }))
      if (entry.isDirectory() && /^sha256-[a-f0-9]{64}-build$/.test(entry.name))
        rmSync(join(this.panelRoot, entry.name), { recursive: true, force: true });
  }
  async stop(reason = new PaneonError('BUILD_CANCELLED', 'The panel build was cancelled.')) {
    if (!this.child.pid || this.child.exitCode !== null || this.child.signalCode !== null) return;
    this.termination ??= reason;
    clearTimeout(this.deadline);
    if (!this.terminating) {
      this.terminating = (async () => {
        let timer: NodeJS.Timeout | undefined;
        try {
          await this.kill('SIGTERM');
          const exited = await Promise.race([
            this.closed.then(() => true),
            new Promise<false>((resolve) => {
              timer = setTimeout(() => resolve(false), 1000);
            }),
          ]);
          if (!exited) await this.kill('SIGKILL');
          await this.closed;
        } finally {
          clearTimeout(timer);
        }
      })();
    }
    await this.terminating;
    await this.closed;
  }
}
