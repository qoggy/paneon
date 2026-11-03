import { existsSync, realpathSync } from 'node:fs';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { createServer } from 'vite';
import type { ViteDevServer } from 'vite';
import type { WatchInputs } from '../shared/types.js';
import { PACKAGE_ROOT } from '../shared/paths.js';
import { watchInputsChanged } from '../compiler/watch-inputs.js';

export type SourceSubscription = {
  update: (inputs: WatchInputs, check?: WatchInputs) => Promise<void>;
  close: () => Promise<void>;
};
type Subscriber = {
  paths: Set<string>;
  closed: boolean;
  dirty: boolean;
  running: boolean;
  onChange: () => Promise<void>;
};
type Register = (...args: unknown[]) => Promise<unknown>;
type NativeWatcher = ViteDevServer['watcher'] & {
  _fsEventsHandler?: Record<string, Register>;
  _nodeFsHandler?: Record<string, Register>;
};

// Missing candidates use the identity of their nearest existing parent, so
// /tmp aliases and creation/deletion use the same subscription keys.
function canonical(path: string): string {
  const tail: string[] = [];
  let parent = resolve(path);
  for (;;) {
    try {
      return join(realpathSync(parent), ...tail);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT' && code !== 'ENOTDIR') throw error;
      tail.unshift(basename(parent));
      parent = dirname(parent);
    }
  }
}

// Vite bundles Chokidar 3: add() returns before native registration, and ready
// can precede missing-path parent registration. Await the actual backend tasks
// for every addition, including later subscriptions and changed import graphs.
async function addAndSettle(watcher: ViteDevServer['watcher'], paths: string[]) {
  if (!paths.length) return;
  const native = watcher as NativeWatcher;
  const handler = native._fsEventsHandler ?? native._nodeFsHandler;
  const method = native._fsEventsHandler ? '_addToFsEvents' : '_addToNodeFs';
  const add = handler?.[method];
  if (!handler || !add) throw new Error('Vite source watcher registration API changed.');
  const tasks: Promise<unknown>[] = [];
  handler[method] = (...args) => {
    const task = add.apply(handler, args);
    tasks.push(task);
    return task;
  };
  try {
    watcher.add(paths);
    let consumed = 0;
    while (consumed < tasks.length) {
      const batch = tasks.slice(consumed);
      consumed = tasks.length;
      await Promise.all(batch);
      // NodeFs adds missing paths' parents in add().then(). Yield a turn so
      // those continuations enqueue their tasks before checking for completion.
      if (method === '_addToNodeFs') await new Promise<void>((resolve) => setImmediate(resolve));
    }
  } finally {
    handler[method] = add;
  }
}

export class SourceWatcher {
  private server?: Promise<ViteDevServer>;
  private owners = new Map<string, Set<Subscriber>>();
  private ancestors = new Set<string>();
  private registered = new Set<string>();
  private directories = new Set<string>();
  private retiredDirectories = new Set<string>();
  private subscribers = new Set<Subscriber>();
  private changes: Promise<void> = Promise.resolve();
  private stopped = false;
  private onError: (error: unknown) => void;

  constructor(onError: (error: unknown) => void) {
    this.onError = onError;
  }
  get size() {
    return this.subscribers.size;
  }
  get servers() {
    return this.server ? 1 : 0;
  }
  async getWatched() {
    return this.server ? (await this.server).watcher.getWatched() : {};
  }

  private queue(task: () => Promise<void>) {
    const result = this.changes.then(task);
    this.changes = result.catch(this.onError);
    return result;
  }
  private start() {
    return (this.server ??= createServer({
      root: PACKAGE_ROOT,
      configFile: false,
      envDir: false,
      publicDir: false,
      logLevel: 'silent',
      optimizeDeps: { noDiscovery: true },
      server: {
        middlewareMode: true,
        hmr: false,
        watch: {
          // Chokidar 3's macOS exact-file callback has depth one.
          depth: 1,
          ignored: (path: string) => {
            const key = resolve(path);
            return !this.owners.has(key) && !this.ancestors.has(key);
          },
        },
      },
    }).then((server) => {
      server.watcher.on('error', this.onError);
      server.watcher.on('all', (kind, file) => {
        if (!['change', 'add', 'unlink', 'addDir', 'unlinkDir'].includes(kind)) return;
        try {
          const affected = new Set([
            ...(this.owners.get(resolve(file)) ?? []),
            ...(this.owners.get(canonical(file)) ?? []),
          ]);
          if (kind === 'addDir') {
            this.directories.add(resolve(file));
            this.directories.add(canonical(file));
          }
          for (const subscriber of affected) this.notify(subscriber);
        } catch (error) {
          this.onError(error);
        }
      });
      return server;
    }));
  }
  private notify(subscriber: Subscriber) {
    if (subscriber.closed || this.stopped) return;
    subscriber.dirty = true;
    if (subscriber.running) return;
    subscriber.running = true;
    void (async () => {
      while (subscriber.dirty && !subscriber.closed && !this.stopped) {
        subscriber.dirty = false;
        await subscriber.onChange();
      }
    })()
      .catch(this.onError)
      .finally(() => {
        subscriber.running = false;
        if (subscriber.dirty && !subscriber.closed && !this.stopped) this.notify(subscriber);
      });
  }
  private refreshAncestors() {
    this.ancestors.clear();
    for (const path of this.owners.keys()) {
      let parent = dirname(path);
      while (!this.ancestors.has(parent)) {
        this.ancestors.add(parent);
        if (parent === dirname(parent)) break;
        parent = dirname(parent);
      }
    }
  }
  private async replace(subscriber: Subscriber, paths: Set<string>) {
    const added: string[] = [];
    for (const path of paths) {
      let owners = this.owners.get(path);
      if (!owners) {
        owners = new Set();
        this.owners.set(path, owners);
        added.push(path);
      }
      owners.add(subscriber);
    }
    for (const path of subscriber.paths) {
      if (paths.has(path)) continue;
      const owners = this.owners.get(path) as Set<Subscriber>;
      owners.delete(subscriber);
      if (!owners.size) {
        this.owners.delete(path);
      }
    }
    subscriber.paths = paths;
    this.refreshAncestors();
    const watcher = paths.size ? ((await this.start()).watcher as NativeWatcher) : undefined;
    const nodeFs = watcher?._nodeFsHandler;
    // Chokidar unwatch(dir) ignores its descendants too. Reactivate any retired
    // ancestor before adding a new child, including historical-manifest files.
    const missingRetired: string[] = [];
    for (const directory of this.retiredDirectories) {
      if (added.some((path) => path === directory || path.startsWith(directory + sep))) {
        if (nodeFs && !existsSync(directory)) missingRetired.push(directory);
        else added.push(directory);
        this.retiredDirectories.delete(directory);
      }
    }
    if (watcher) {
      const wanted = new Set(
        [...this.owners.keys(), ...added].map((path) => {
          if (!nodeFs || existsSync(path)) return path;
          let parent = dirname(path);
          while (!existsSync(parent)) parent = dirname(parent);
          // Register the directory without Chokidar's missing-child target.
          // Otherwise sibling missing targets share a throttled read and can
          // hide one another's creation. Ownership still filters traversal.
          this.directories.add(parent);
          return parent;
        }),
      );
      const pending = [...wanted].filter((path) => !this.registered.has(path));
      await addAndSettle(watcher, pending);
      for (const path of pending) this.registered.add(path);
      // add() must also clear retired directories' ignored prefixes. When the
      // directory is missing, first establish the untargeted parent listener;
      // its reads must precede NodeFs's targeted missing-child callbacks.
      await addAndSettle(
        watcher,
        missingRetired.filter((path) => !this.registered.has(path)),
      );
    }
    const removed = [...this.registered].filter(
      (path) => !this.owners.has(path) && !this.ancestors.has(path),
    );
    if (removed.length && this.server) {
      const watcher = (await this.server).watcher;
      // Missing candidates may have become directories without an addDir
      // event (ignoreInitial). Match the directories Chokidar will ignore.
      const watched = watcher.getWatched();
      watcher.unwatch(removed);
      for (const path of removed) {
        this.registered.delete(path);
        if (this.directories.delete(path) || Object.hasOwn(watched, path)) {
          // add(parent) does not remove a separately ignored child prefix.
          // Keep every retired directory until its own prefix is reactivated.
          this.retiredDirectories.add(path);
        }
      }
    }
  }
  async subscribe(inputs: WatchInputs, onChange: () => Promise<void>): Promise<SourceSubscription> {
    const subscriber: Subscriber = {
      paths: new Set(),
      closed: false,
      dirty: false,
      running: false,
      onChange,
    };
    const update = (next: WatchInputs, check = next) =>
      this.queue(async () => {
        if (subscriber.closed || this.stopped) return;
        const paths = new Set<string>();
        for (const path of [...Object.keys(next.files), ...Object.keys(next.paths)]) {
          paths.add(resolve(path));
          paths.add(canonical(path));
          for (let parent = dirname(path); !existsSync(parent); parent = dirname(parent)) {
            paths.add(resolve(parent));
            paths.add(canonical(parent));
          }
          if (next.paths[path] === 'directory') {
            this.directories.add(resolve(path));
            this.directories.add(canonical(path));
          }
        }
        await this.replace(subscriber, paths);
        if (await watchInputsChanged(check)) this.notify(subscriber);
      });
    const close = async () => {
      subscriber.closed = true;
      this.subscribers.delete(subscriber);
      await this.queue(async () => {
        await this.replace(subscriber, new Set());
        if (!this.subscribers.size) await this.closeServer();
      });
    };
    this.subscribers.add(subscriber);
    try {
      await update(inputs);
    } catch (error) {
      await close();
      throw error;
    }
    return { update, close };
  }
  async stop() {
    this.stopped = true;
    for (const subscriber of this.subscribers) subscriber.closed = true;
    this.subscribers.clear();
    await this.changes;
    await this.closeServer();
    this.owners.clear();
    this.ancestors.clear();
  }
  private async closeServer() {
    if (this.server) await (await this.server).close();
    this.server = undefined;
    this.registered.clear();
    this.directories.clear();
    this.retiredDirectories.clear();
  }
}
