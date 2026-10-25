import { realpathSync } from 'node:fs';
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
    // Chokidar unwatch(dir) ignores its descendants too. Reactivate any retired
    // ancestor before adding a new child, including historical-manifest files.
    for (const directory of this.retiredDirectories) {
      if (added.some((path) => path === directory || path.startsWith(directory + sep))) {
        added.push(directory);
        this.retiredDirectories.delete(directory);
      }
    }
    if (paths.size) {
      (await this.start()).watcher.add(added);
      for (const path of added) this.registered.add(path);
    }
    const removed = [...this.registered].filter(
      (path) => !this.owners.has(path) && !this.ancestors.has(path),
    );
    if (removed.length && this.server) {
      (await this.server).watcher.unwatch(removed);
      for (const path of removed) {
        this.registered.delete(path);
        if (this.directories.delete(path)) {
          if (![...this.retiredDirectories].some((parent) => path.startsWith(parent + sep))) {
            for (const child of this.retiredDirectories)
              if (child.startsWith(path + sep)) this.retiredDirectories.delete(child);
            this.retiredDirectories.add(path);
          }
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
