import pino from 'pino';
import type { Logger } from 'pino';
import { fork } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import { watchInputsFor } from '../compiler/watch-inputs.js';
import { SourceWatcher } from './source-watcher.js';
import type { SourceSubscription } from './source-watcher.js';
import { CompilerProcess } from '../compiler/process.js';
import type { CompiledPanel } from '../compiler/index.js';
import { PACKAGE_ROOT, PACKAGE_VERSION } from '../shared/paths.js';
import { EVENT_PAYLOAD_LIMIT_CHARACTERS, EVENT_TYPE_LIMIT_CHARACTERS } from '../shared/limits.js';
import { PaneonError, diagnostic, jsonValue } from '../shared/types.js';
import type { StoredPanel, JsonValue, Manifest } from '../shared/types.js';
import { Store } from './store.js';
import { ResourcePool } from './resource-pool.js';
import type { ResourceLease } from './resource-pool.js';
import { Artifacts } from './artifacts.js';
class Execution {
  child: ChildProcess;
  private requests = new Map<
    string,
    { resolve: (v: JsonValue) => void; reject: (e: Error) => void }
  >();
  ready: Promise<void>;
  get alive() {
    return this.child.exitCode === null && this.child.signalCode === null && this.child.connected;
  }
  constructor(compiled: CompiledPanel, panel: StoredPanel) {
    this.child = fork(join(PACKAGE_ROOT, 'dist/runtime/worker.js'), [], {
      cwd: panel.cwd,
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      execArgv: [],
    });
    this.ready = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.child.kill();
        reject(new PaneonError('BUILD_FAILED', 'Panel execution initialization timed out.'));
      }, 15000);
      this.child.on('message', (raw: unknown) => {
        const m = raw as {
          kind: string;
          requestId: string;
          data: JsonValue;
          error?: { code: string; message: string };
        };
        if (m.kind === 'ready') {
          clearTimeout(timeout);
          resolve();
        }
        if (m.kind === 'error') {
          clearTimeout(timeout);
          reject(
            new PaneonError(
              m.error?.code ?? 'BUILD_FAILED',
              m.error?.message ?? 'Panel execution failed.',
            ),
          );
        }
        if (m.kind === 'result') {
          const request = this.requests.get(m.requestId);
          if (!request) return;
          this.requests.delete(m.requestId);
          if (m.error) request.reject(new PaneonError(m.error.code, m.error.message));
          else request.resolve(m.data);
        }
      });
      this.child.on('error', () => {
        clearTimeout(timeout);
        reject(
          new PaneonError('RUNTIME_UNAVAILABLE', 'The action execution process could not start.'),
        );
      });
      this.child.on('exit', () => {
        clearTimeout(timeout);
        reject(new PaneonError('RUNTIME_UNAVAILABLE', 'The action execution process stopped.'));
        for (const p of this.requests.values())
          p.reject(
            new PaneonError(
              'RESULT_UNKNOWN',
              'The execution connection closed; the action result is unknown.',
            ),
          );
        this.requests.clear();
      });
    });
    this.child.send({
      kind: 'init',
      serverFile: join(compiled.directory, compiled.manifest.serverEntry),
      params: panel.params,
      actions: compiled.manifest.actions.map((a) => ({ id: a.id, name: a.id.split('#').at(-1) })),
    });
  }
  async request(kind: string, payload: Record<string, unknown>): Promise<JsonValue> {
    await this.ready;
    const requestId = randomUUID();
    return new Promise((resolve, reject) => {
      this.requests.set(requestId, { resolve, reject });
      this.child.send({ kind, requestId, ...payload }, (error) => {
        if (error) {
          this.requests.delete(requestId);
          reject(
            new PaneonError(
              'RESULT_UNKNOWN',
              'The execution connection closed; the action result is unknown.',
            ),
          );
        }
      });
    });
  }
  async stop() {
    if (this.child.exitCode !== null || this.child.signalCode !== null) return;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => this.child.kill('SIGKILL'), 1000);
      this.child.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
      if (this.child.connected) this.child.send({ kind: 'stop' });
      else this.child.kill();
    });
  }
}
type Live = { compiled: CompiledPanel; execution?: Execution; watcher?: SourceSubscription };
export type RuntimeResourceOptions = {
  maxPanels?: number;
  maxWaiting?: number;
  waitMs?: number;
  compilerTimeoutMs?: number;
};
export class Runtime extends EventEmitter {
  store: Store;
  live = new Map<string, Live>();
  stopping = false;
  private builds = new Map<string, Promise<void>>();
  private logger: Logger;
  private compilers = new Map<string, CompilerProcess>();
  private initializing = new Map<string, Execution>();
  private residents: ResourcePool;
  private compilation: ResourcePool;
  private compilerTimeoutMs: number | undefined;
  private artifacts: Artifacts;
  private artifactCleanup?: Promise<void>;
  private sources: SourceWatcher;
  home: string;
  constructor(
    home: string,
    logger: Logger = pino({}, process.stderr),
    options: RuntimeResourceOptions = {},
  ) {
    super();
    this.logger = logger;
    this.home = home;
    this.compilerTimeoutMs = options.compilerTimeoutMs;
    this.store = new Store(home);
    this.artifacts = new Artifacts(home);
    this.sources = new SourceWatcher((err) => this.logger.error({ err }, 'Source watcher failed'));
    const onError = (err: unknown) =>
      this.logger.error({ err }, 'Runtime resource retirement failed');
    this.residents = new ResourcePool(
      options.maxPanels ?? 10,
      (id) => this.dispose(id),
      onError,
      options.maxWaiting ?? 32,
      options.waitMs ?? 10000,
    );
    this.compilation = new ResourcePool(
      1,
      async (id) => {
        await this.compilers.get(id)?.stop();
      },
      onError,
      options.maxWaiting ?? 32,
      null,
      false,
    );
  }
  get resourceUsage() {
    const executions = new Set(this.initializing.values());
    for (const live of this.live.values()) if (live.execution) executions.add(live.execution);
    return {
      residentPanels: this.residents.size,
      workers: [...executions].filter((execution) => execution.alive).length,
      watchers: [...this.live.values()].filter((value) => value.watcher).length,
      queued: this.residents.queued,
      compiling: this.compilers.size,
      queuedBuilds: this.compilation.queued,
    };
  }
  async restore() {
    // Persisted running means logically open, not resident. History and static
    // artifacts are usable without evaluating historical author modules.
  }
  collectArtifacts() {
    return (this.artifactCleanup ??= this.sweepArtifacts());
  }
  private async sweepArtifacts() {
    try {
      for (const id of await this.artifacts.instances()) {
        if (this.stopping) break;
        await this.enqueue(id, async () => {
          if (this.stopping) return;
          // A concurrent close owns final deletion after its live resources exit.
          if (this.store.find(id)?.status === 'closed' && this.live.has(id)) return;
          await this.pruneArtifacts(id, true);
        });
      }
    } catch (err) {
      this.logger.error({ err }, 'Startup artifact cleanup failed');
    }
  }
  private async pruneArtifacts(id: string, includeClosed = false) {
    try {
      const panel = this.store.find(id);
      const revision =
        panel && (!includeClosed || panel.status !== 'closed') ? panel.revision : undefined;
      await this.artifacts.prune(id, revision);
    } catch (err) {
      this.logger.error({ err, instanceId: id }, 'Panel artifact cleanup failed');
    }
  }
  inspect(id: string) {
    const panel = this.store.get(id);
    const manifest = this.manifest(panel.instanceId);
    return { ...panel, ...(manifest ? { manifest } : {}) };
  }
  artifact(id: string, revision: string) {
    const panel = this.store.get(id);
    if (panel.status === 'closed' || panel.revision !== revision) return;
    return (
      this.live.get(panel.instanceId)?.compiled ?? this.artifacts.read(panel.instanceId, revision)
    );
  }
  private assertOpen(panel: StoredPanel, signal?: AbortSignal) {
    if (this.stopping) throw new PaneonError('RUNTIME_UNAVAILABLE', 'The service is stopping.');
    signal?.throwIfAborted();
    const stored = this.store.find(panel.instanceId);
    if (stored?.status === 'closed')
      throw new PaneonError('PANEL_CLOSED', 'The panel instance is closed.');
    return stored ?? panel;
  }
  private enqueue<T>(id: string, task: () => Promise<T>, after?: () => Promise<void>): Promise<T> {
    const promise = (this.builds.get(id) ?? Promise.resolve()).then(task).finally(after);
    const tail = promise
      .then(
        () => {},
        (err: unknown) => {
          this.logger.debug({ err, instanceId: id }, 'Panel build queue settled after failure');
        },
      )
      .finally(() => {
        if (this.builds.get(id) === tail) this.builds.delete(id);
      });
    this.builds.set(id, tail);
    return promise;
  }
  private prepare(
    panel: StoredPanel,
    signal: AbortSignal,
    execute: boolean,
    refresh: 'cold' | 'watch' | 'force' = 'cold',
  ): Promise<StoredPanel> {
    let attemptedBuild = false;
    return this.enqueue(
      panel.instanceId,
      async () => {
        const current = this.assertOpen(panel, signal);
        let previous = this.live.get(current.instanceId);
        if (previous?.execution && !previous.execution.alive) previous.execution = undefined;
        // A user action may have started execution while this watch reload was waiting.
        const shouldExecute = refresh === 'watch' ? Boolean(previous?.execution) : execute;
        let compiled = previous?.compiled;
        if (!compiled) {
          try {
            compiled = this.artifacts.read(current.instanceId, current.revision);
          } catch (err) {
            if (refresh !== 'force') throw err;
            this.logger.debug(
              { err, instanceId: current.instanceId },
              'Explicit reload will regenerate an unreadable manifest',
            );
          }
        }
        const reattachWatch = current.watch && !previous?.watcher;
        if (compiled && reattachWatch) {
          // Watch the last successful graph before evaluating sleeping edits, so
          // a broken edit still leaves a way to observe its eventual correction.
          const watcher = await this.watch(current, compiled, signal);
          try {
            this.assertOpen(current, signal);
          } catch (error) {
            await watcher.close();
            throw error;
          }
          previous = { compiled, execution: previous?.execution, watcher };
          this.live.set(current.instanceId, previous);
        }
        const rebuild =
          refresh === 'force' ||
          !compiled ||
          compiled.manifest.paneonVersion !== PACKAGE_VERSION ||
          ((refresh === 'watch' || reattachWatch) && !(await this.artifacts.unchanged(compiled)));
        if (rebuild) {
          attemptedBuild = true;
          const permit = await this.compilation.acquire(current.instanceId, signal);
          try {
            this.assertOpen(current, signal);
            const compiler = new CompilerProcess(
              current.entryPath,
              join(this.home, 'panels', current.instanceId),
              this.compilerTimeoutMs,
            );
            this.compilers.set(current.instanceId, compiler);
            try {
              compiled = await compiler.result;
              this.artifacts.forget(compiled.directory);
            } catch (error) {
              if (previous?.watcher && compiler.watchInputs && !signal.aborted && !this.stopping) {
                const good = watchInputsFor(current.entryPath, previous.compiled.manifest);
                const failed = compiler.watchInputs;
                await previous.watcher.update(
                  {
                    files: { ...good.files, ...failed.files },
                    paths: { ...good.paths, ...failed.paths },
                  },
                  failed,
                );
              }
              throw error;
            } finally {
              this.compilers.delete(current.instanceId);
            }
          } finally {
            permit.release();
          }
        }
        this.assertOpen(current, signal);
        if (!compiled)
          throw new PaneonError('BUILD_FAILED', 'The panel has no compiled artifacts.');
        const recovered = Boolean(current.diagnostic && (refresh === 'watch' || reattachWatch));
        const next: StoredPanel = rebuild
          ? {
              ...current,
              status: 'running',
              definitionId: compiled.manifest.definitionId,
              revision: compiled.manifest.revision,
              requires: compiled.manifest.requires,
              paneonVersion: PACKAGE_VERSION,
              updatedAt: new Date().toISOString(),
            }
          : recovered
            ? { ...current, updatedAt: new Date().toISOString() }
            : current;
        if (rebuild || recovered) delete next.diagnostic;
        // Compilation failure leaves the previous working revision intact. Once
        // built, retire its resources before starting a replacement to respect K.
        if (rebuild && previous) {
          await previous.execution?.stop();
          previous.execution = undefined;
        }
        const live: Live = { compiled, execution: previous?.execution, watcher: previous?.watcher };
        let createdExecution: Execution | undefined;
        let createdWatcher: SourceSubscription | undefined;
        let published = false;
        try {
          if (next.watch && !live.watcher) {
            createdWatcher = await this.watch(next, compiled, signal);
            live.watcher = createdWatcher;
          }
          if (shouldExecute && !live.execution) {
            createdExecution = new Execution(compiled, next);
            this.initializing.set(current.instanceId, createdExecution);
            await createdExecution.ready;
            this.assertOpen(next, signal);
            live.execution = createdExecution;
          }
          this.assertOpen(next, signal);
          if (live.watcher)
            await live.watcher.update(watchInputsFor(next.entryPath, compiled.manifest));
          this.assertOpen(next, signal);
          this.live.set(current.instanceId, live);
          if (rebuild || recovered) this.store.save(next);
          published = true;
          if (rebuild || recovered || refresh === 'watch') this.state(current.instanceId);
          return next;
        } finally {
          this.initializing.delete(current.instanceId);
          if (!published) {
            await createdWatcher?.close();
            await createdExecution?.stop();
          }
        }
      },
      () => (attemptedBuild ? this.pruneArtifacts(panel.instanceId) : Promise.resolve()),
    );
  }
  private watch(panel: StoredPanel, compiled: CompiledPanel, signal: AbortSignal) {
    return this.sources.subscribe(watchInputsFor(panel.entryPath, compiled.manifest), async () => {
      // Invalidation can arrive while the first publication is still pending.
      // Wait outside the build queue before looking up its persisted identity.
      await this.builds.get(panel.instanceId);
      if (signal.aborted || this.stopping) return;
      try {
        await this.rebuild(
          panel.instanceId,
          Boolean(this.live.get(panel.instanceId)?.execution),
          'watch',
        );
      } catch (err) {
        this.logger.error({ err, instanceId: panel.instanceId }, 'Watched panel reload failed');
      }
    });
  }
  private async dispose(id: string) {
    await this.compilers.get(id)?.stop();
    await this.initializing.get(id)?.stop();
    await this.builds.get(id);
    const live = this.live.get(id);
    try {
      await live?.watcher?.close();
    } finally {
      await live?.execution?.stop();
      this.live.delete(id);
    }
  }
  state(id: string, building = false) {
    const panel = this.store.get(id);
    this.emit('state', panel.instanceId, {
      type: 'state',
      status: panel.status,
      revision: panel.revision,
      ...(panel.diagnostic ? { diagnostic: panel.diagnostic } : {}),
      building,
    });
  }
  async run(entryPath: string, cwd: string, params: JsonValue, watch: boolean) {
    const now = new Date().toISOString();
    const panel = this.store.save({
      definitionId: '',
      status: 'unavailable',
      entryPath,
      cwd,
      params,
      watch,
      revision: '',
      createdAt: now,
      updatedAt: now,
      requires: { paneon: '' },
      paneonVersion: PACKAGE_VERSION,
    });
    try {
      const lease = await this.residents.acquire(panel.instanceId);
      try {
        return await this.prepare(panel, lease.signal, true, 'force');
      } finally {
        await this.release(panel.instanceId, lease);
      }
    } catch (error) {
      // Close/delete owns the record once it has cancelled initial creation.
      if (this.store.find(panel.instanceId)?.status !== 'closed')
        this.store.delete(panel.instanceId);
      throw error;
    }
  }
  private failure(id: string, error: unknown) {
    if (this.stopping) return;
    const current = this.store.find(id);
    if (!current || current.status === 'closed') return;
    if (current.paneonVersion !== PACKAGE_VERSION) current.status = 'unavailable';
    current.diagnostic = diagnostic(error);
    current.updatedAt = new Date().toISOString();
    this.store.save(current);
    this.state(id);
  }
  async observe(id: string) {
    const panel = this.store.get(id);
    id = panel.instanceId;
    if (panel.status === 'closed' || !panel.watch) return;
    const lease = await this.residents.acquire(id);
    try {
      await this.prepare(panel, lease.signal, false);
    } catch (error) {
      this.failure(id, error);
      throw error;
    } finally {
      await this.release(id, lease);
    }
  }
  async reload(id: string) {
    return this.rebuild(id, true);
  }
  private async rebuild(id: string, execute: boolean, refresh: 'watch' | 'force' = 'force') {
    const panel = this.store.get(id);
    id = panel.instanceId;
    if (panel.status === 'closed')
      throw new PaneonError('PANEL_CLOSED', 'The panel instance is closed.');
    const lease = await this.residents.acquire(id);
    this.state(id, true);
    try {
      const next = await this.prepare(panel, lease.signal, execute, refresh);
      return {
        previousRevision: panel.revision,
        revision: next.revision,
        changed: next.revision !== panel.revision,
        watch: next.watch,
      };
    } catch (error) {
      this.failure(id, error);
      throw error;
    } finally {
      await this.release(id, lease);
    }
  }
  private async retirePanel(id: string) {
    const panel = this.store.get(id);
    id = panel.instanceId;
    const alreadyClosed = panel.status === 'closed';
    panel.status = 'closed';
    panel.updatedAt = new Date().toISOString();
    this.store.save(panel);
    await this.residents.remove(
      id,
      new PaneonError('PANEL_CLOSED', 'The panel instance is closed.'),
    );
    await this.enqueue(id, () => this.pruneArtifacts(id, true));
    return { status: 'closed' as const, alreadyClosed };
  }
  async closePanel(id: string) {
    id = this.store.get(id).instanceId;
    const result = await this.retirePanel(id);
    this.state(id);
    return result;
  }
  async deletePanel(id: string) {
    const { instanceId } = this.store.get(id);
    await this.retirePanel(instanceId);
    await this.enqueue(instanceId, () => Promise.resolve(this.store.delete(instanceId)));
    this.emit('deleted', instanceId);
    return { deleted: true as const };
  }
  async readFile(id: string, revision: string, reference: unknown) {
    const panel = this.current(id, revision);
    const { readFilePreview } = await import('./file-preview.js');
    const result = await readFilePreview(panel.cwd, reference);
    this.current(id, revision);
    return result;
  }
  private current(id: string, revision: string) {
    if (this.stopping) throw new PaneonError('RUNTIME_UNAVAILABLE', 'The service is stopping.');
    const panel = this.store.get(id);
    if (panel.status !== 'running')
      throw new PaneonError(
        panel.status === 'closed' ? 'PANEL_CLOSED' : 'PANEL_UNAVAILABLE',
        'The panel is not running.',
      );
    if (panel.revision !== revision)
      throw new PaneonError(
        'PANEL_REVISION_MISMATCH',
        'The panel source changed. Refresh before choosing an action.',
      );
    return panel;
  }
  private async withExecution<T>(
    id: string,
    revision: string,
    operation: (live: Live & { execution: Execution }) => Promise<T>,
  ): Promise<T> {
    const panel = this.current(id, revision);
    id = panel.instanceId;
    const lease = await this.residents.acquire(id);
    try {
      try {
        await this.prepare(panel, lease.signal, true);
      } catch (error) {
        this.failure(id, error);
        throw error;
      }
      this.current(id, revision);
      lease.signal.throwIfAborted();
      const live = this.live.get(id);
      if (!live?.execution)
        throw new PaneonError(
          'PANEL_UNAVAILABLE',
          'The panel execution environment is unavailable.',
        );
      return await operation({ ...live, execution: live.execution });
    } finally {
      await this.release(id, lease);
    }
  }
  private async release(id: string, lease: ResourceLease) {
    lease.release();
    if (!this.live.has(id)) await this.residents.discardIdle(id);
  }
  async invoke(id: string, revision: string, actionId: string, input: unknown) {
    return this.withExecution(id, revision, async (live) => {
      if (!live.compiled.manifest.actions.some((action) => action.id === actionId))
        throw new PaneonError('ACTION_NOT_FOUND', 'The action is not declared.');
      return live.execution.request('invoke', { actionId, input });
    });
  }
  async append(id: string, revision: string, type: string, payload: unknown) {
    if (typeof type !== 'string' || type.length > EVENT_TYPE_LIMIT_CHARACTERS)
      throw new PaneonError(
        'INVALID_EVENT',
        `The event type must be a string of at most ${EVENT_TYPE_LIMIT_CHARACTERS} UTF-16 code units.`,
      );
    if (JSON.stringify(payload)?.length > EVENT_PAYLOAD_LIMIT_CHARACTERS)
      throw new PaneonError(
        'INVALID_EVENT',
        `The serialized event payload exceeds the ${EVENT_PAYLOAD_LIMIT_CHARACTERS}-character UTF-16 limit.`,
      );
    return this.withExecution(id, revision, async (live) => {
      const parsed = await live.execution.request('validate-event', { type, payload });
      const panel = this.current(id, revision);
      const result = this.store.appendCurrent(panel.instanceId, revision, type, jsonValue(parsed));
      this.emit('event', panel.instanceId);
      this.state(panel.instanceId);
      return result;
    });
  }
  async events(id: string, consumer: string, limit: number, waitMs: number) {
    id = this.store.get(id).instanceId;
    let result = this.store.read(id, consumer, limit);
    if (result.events.length || !waitMs) return result;
    await new Promise<void>((resolve, reject) => {
      const finish = () => {
        cleanup();
        resolve();
      };
      const onEvent = (changedId: string) => {
        if (changedId === id) finish();
      };
      const onStop = () => {
        cleanup();
        reject(
          new PaneonError('RUNTIME_UNAVAILABLE', 'The service stopped while waiting for events.'),
        );
      };
      const timer = setTimeout(finish, waitMs);
      const cleanup = () => {
        clearTimeout(timer);
        this.off('event', onEvent);
        this.off('deleted', onEvent);
        this.off('stop', onStop);
      };
      this.on('event', onEvent);
      this.on('deleted', onEvent);
      this.on('stop', onStop);
    });
    result = this.store.read(id, consumer, limit);
    return { ...result, timedOut: result.events.length === 0 };
  }
  manifest(id: string): Manifest | undefined {
    const panel = this.store.get(id);
    return (
      this.live.get(panel.instanceId)?.compiled ??
      this.artifacts.read(panel.instanceId, panel.revision)
    )?.manifest;
  }
  async stop() {
    this.stopping = true;
    this.emit('stop');
    await Promise.all([this.residents.stop(), this.compilation.stop()]);
    await Promise.all([...this.builds.values()]);
    await this.sources.stop();
    await this.artifactCleanup;
    this.live.clear();
    this.artifacts.clear();
    this.store.close();
  }
}
