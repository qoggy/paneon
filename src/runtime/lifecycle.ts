import { fork } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import type { ViteDevServer } from 'vite';
import { watchPanel } from '../compiler/index.js';
import { CompilerProcess } from '../compiler/process.js';
import type { CompiledPanel } from '../compiler/index.js';
import { PACKAGE_ROOT, PACKAGE_VERSION } from '../shared/paths.js';
import { PaneonError, diagnostic, jsonValue } from '../shared/types.js';
import type { StoredPanel, JsonValue, Manifest } from '../shared/types.js';
import { Store } from './store.js';
import { Credentials } from './credentials.js';
class Execution {
  child: ChildProcess;
  private requests = new Map<
    string,
    { resolve: (v: JsonValue) => void; reject: (e: Error) => void }
  >();
  ready: Promise<void>;
  private usedSecrets = new Map<string, Set<string>>();
  constructor(compiled: CompiledPanel, panel: StoredPanel, credentials: Credentials) {
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
          callId: string;
          ref: string;
          actionId: string;
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
        if (m.kind === 'secret') {
          try {
            if (!this.requests.has(m.callId))
              throw new PaneonError(
                'CREDENTIAL_BINDING_MISMATCH',
                'The credential call is no longer active.',
              );
            const value = credentials.get(m.ref, {
              instanceId: panel.instanceId,
              revision: panel.revision,
              actionId: m.actionId,
            });
            const known = this.usedSecrets.get(m.callId) ?? new Set<string>();
            if (!known.has(value)) {
              known.add(value);
              credentials.retain(value);
              this.usedSecrets.set(m.callId, known);
            }
            this.child.send({ kind: 'secret-result', requestId: m.requestId, value });
          } catch (e) {
            this.child.send({
              kind: 'secret-result',
              requestId: m.requestId,
              error: diagnostic(e),
            });
          }
        }
        if (m.kind === 'result') {
          const request = this.requests.get(m.requestId);
          if (!request) return;
          this.requests.delete(m.requestId);
          const release = () => {
            for (const value of this.usedSecrets.get(m.requestId) ?? []) credentials.release(value);
            this.usedSecrets.delete(m.requestId);
          };
          if (m.error) request.reject(new PaneonError(m.error.code, m.error.message));
          else {
            try {
              credentials.check(m.data);
              request.resolve(m.data);
            } catch (e) {
              request.reject(e as Error);
            }
          }
          release();
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
        for (const values of this.usedSecrets.values())
          for (const value of values) credentials.release(value);
        this.usedSecrets.clear();
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
type Live = { compiled: CompiledPanel; execution: Execution; watcher?: ViteDevServer };
export class Runtime extends EventEmitter {
  store: Store;
  credentials = new Credentials();
  live = new Map<string, Live>();
  stopping = false;
  private builds = new Map<string, Promise<StoredPanel>>();
  private compilers = new Map<string, CompilerProcess>();
  private initializing = new Map<string, Execution>();
  home: string;
  constructor(home: string) {
    super();
    this.home = home;
    this.store = new Store(home);
  }
  async restore() {
    for (const panel of this.store.all())
      if (panel.status !== 'closed') {
        try {
          await this.load(panel);
        } catch (e) {
          panel.status = 'unavailable';
          panel.diagnostic = diagnostic(e);
          this.store.save(panel);
        }
      }
  }
  inspect(id: string) {
    const panel = this.store.get(id);
    const live = this.live.get(id);
    return { ...panel, ...(live ? { manifest: live.compiled.manifest } : {}) };
  }
  private load(panel: StoredPanel): Promise<StoredPanel> {
    if (this.stopping)
      return Promise.reject(new PaneonError('RUNTIME_UNAVAILABLE', 'The service is stopping.'));
    const previous = this.builds.get(panel.instanceId);
    const promise = (previous ? previous.catch(() => undefined) : Promise.resolve()).then(() =>
      this.buildPanel(panel),
    );
    this.builds.set(panel.instanceId, promise);
    void promise
      .finally(() => {
        if (this.builds.get(panel.instanceId) === promise) this.builds.delete(panel.instanceId);
      })
      .catch(() => {});
    return promise;
  }
  private async buildPanel(panel: StoredPanel) {
    if (this.stopping) throw new PaneonError('RUNTIME_UNAVAILABLE', 'The service is stopping.');
    const stored = this.store.all().find((p) => p.instanceId === panel.instanceId);
    if (stored?.status === 'closed')
      throw new PaneonError('PANEL_CLOSED', 'The panel instance is closed.');

    const compiler = new CompilerProcess(
      panel.entryPath,
      join(this.home, 'panels', panel.instanceId),
    );
    this.compilers.set(panel.instanceId, compiler);
    let compiled: CompiledPanel;
    try {
      compiled = await compiler.result;
    } finally {
      if (this.compilers.get(panel.instanceId) === compiler)
        this.compilers.delete(panel.instanceId);
    }
    if (
      this.stopping ||
      this.store.all().find((p) => p.instanceId === panel.instanceId)?.status === 'closed'
    )
      throw new PaneonError('PANEL_CLOSED', 'The panel execution environment was closed.');
    const next: StoredPanel = {
      ...panel,
      status: 'running',
      definitionId: compiled.manifest.definitionId,
      revision: compiled.manifest.revision,
      requires: compiled.manifest.requires,
      paneonVersion: PACKAGE_VERSION,
      updatedAt: new Date().toISOString(),
    };
    delete next.diagnostic;
    const execution = new Execution(compiled, next, this.credentials);
    this.initializing.set(panel.instanceId, execution);
    let live: Live | undefined;
    let published = false;
    try {
      await execution.ready;
      live = { compiled, execution };
      if (next.watch)
        live.watcher = await watchPanel(
          next.entryPath,
          compiled.manifest.dependencies,
          async () => {
            try {
              await this.reload(next.instanceId);
            } catch {
              /* reload owns its framework diagnostic */
            }
          },
        );
      if (
        this.stopping ||
        this.store.all().find((p) => p.instanceId === panel.instanceId)?.status === 'closed'
      )
        throw new PaneonError('PANEL_CLOSED', 'The panel execution environment was closed.');
      const previous = this.live.get(panel.instanceId);
      this.credentials.invalidate(panel.instanceId);
      if (previous) {
        await previous.watcher?.close();
        await previous.execution.stop();
      }
      if (
        this.stopping ||
        this.store.all().find((p) => p.instanceId === panel.instanceId)?.status === 'closed'
      )
        throw new PaneonError('PANEL_CLOSED', 'The panel execution environment was closed.');
      this.live.set(panel.instanceId, live);
      this.store.save(next);
      published = true;
      this.state(panel.instanceId);
      return next;
    } finally {
      if (this.initializing.get(panel.instanceId) === execution)
        this.initializing.delete(panel.instanceId);
      if (!published) {
        await live?.watcher?.close();
        await execution.stop();
      }
    }
  }

  state(id: string, building = false) {
    const panel = this.store.get(id);
    this.emit('state', id, {
      type: 'state',
      status: panel.status,
      revision: panel.revision,
      ...(panel.diagnostic ? { diagnostic: panel.diagnostic } : {}),
      building,
    });
  }
  async run(entryPath: string, cwd: string, params: JsonValue, watch: boolean) {
    const now = new Date().toISOString();
    const panel: StoredPanel = {
      instanceId: 'instance-' + randomUUID(),
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
    };
    return this.load(panel);
  }
  async reload(id: string) {
    const p = this.store.get(id);
    if (p.status === 'closed')
      throw new PaneonError('PANEL_CLOSED', 'The panel instance is closed.');
    const previousRevision = p.revision;
    this.state(id, true);
    try {
      const next = await this.load(p);
      return {
        previousRevision,
        revision: next.revision,
        changed: next.revision !== previousRevision,
        watch: next.watch,
      };
    } catch (e) {
      const current = this.store.get(id);
      if (this.stopping || current.status === 'closed') throw e;
      current.diagnostic = diagnostic(e);
      current.updatedAt = new Date().toISOString();
      this.store.save(current);
      this.state(id);
      throw e;
    }
  }
  async closePanel(id: string) {
    const p = this.store.get(id);
    const alreadyClosed = p.status === 'closed';
    p.status = 'closed';
    p.updatedAt = new Date().toISOString();
    this.store.save(p);
    this.credentials.invalidate(id);
    await this.compilers.get(id)?.stop();
    await this.initializing.get(id)?.stop();
    const live = this.live.get(id);
    if (live) {
      this.live.delete(id);
      await live.watcher?.close();
      await live.execution.stop();
    }
    this.state(id);
    return { status: 'closed' as const, alreadyClosed };
  }
  private active(id: string, revision: string) {
    const p = this.store.get(id);
    if (p.status !== 'running')
      throw new PaneonError(
        p.status === 'closed' ? 'PANEL_CLOSED' : 'PANEL_UNAVAILABLE',
        'The panel is not running.',
      );
    if (p.revision !== revision)
      throw new PaneonError(
        'PANEL_REVISION_MISMATCH',
        'The panel source changed. Refresh before choosing an action.',
      );
    const live = this.live.get(id);
    if (!live)
      throw new PaneonError('PANEL_UNAVAILABLE', 'The panel execution environment is unavailable.');
    return live;
  }
  async invoke(id: string, revision: string, actionId: string, input: unknown) {
    const live = this.active(id, revision);
    if (!live.compiled.manifest.actions.some((a) => a.id === actionId))
      throw new PaneonError('ACTION_NOT_FOUND', 'The action is not declared.');
    return live.execution.request('invoke', { actionId, input });
  }
  async append(id: string, revision: string, type: string, payload: unknown) {
    if (typeof type !== 'string' || type.length > 128 || JSON.stringify(payload)?.length > 65536)
      throw new PaneonError('INVALID_EVENT', 'The event exceeds the allowed limits.');
    const live = this.active(id, revision);
    this.credentials.check(payload);
    const parsed = await live.execution.request('validate-event', { type, payload });
    this.credentials.check(parsed);
    const result = this.store.append(id, revision, type, jsonValue(parsed));
    this.emit('event', id);
    this.state(id);
    return result;
  }
  async events(id: string, consumer: string, limit: number, waitMs: number) {
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
        this.off('stop', onStop);
      };
      this.on('event', onEvent);
      this.on('stop', onStop);
    });
    result = this.store.read(id, consumer, limit);
    return { ...result, timedOut: result.events.length === 0 };
  }
  credential(id: string, revision: string, actionId: string, value: string, ttlSeconds?: number) {
    const live = this.active(id, revision);
    const action = live.compiled.manifest.actions.find((a) => a.id === actionId);
    if (!action?.credential)
      throw new PaneonError(
        'CREDENTIAL_NOT_DECLARED',
        'This action has no declared credential purpose.',
      );
    return this.credentials.create(
      { instanceId: id, revision, actionId },
      value,
      ttlSeconds ?? action.credential.ttlSeconds ?? 900,
    );
  }
  manifest(id: string): Manifest | undefined {
    return this.live.get(id)?.compiled.manifest;
  }
  async stop() {
    this.stopping = true;
    this.emit('stop');
    this.credentials.invalidate();
    await Promise.all([...this.compilers.values()].map((compiler) => compiler.stop()));
    await Promise.all([...this.initializing.values()].map((execution) => execution.stop()));
    await Promise.allSettled([...this.builds.values()]);
    for (const live of this.live.values()) {
      await live.watcher?.close();
      await live.execution.stop();
    }
    this.live.clear();
    this.store.close();
  }
}
