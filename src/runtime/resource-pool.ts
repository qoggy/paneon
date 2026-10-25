import { PaneonError } from '../shared/types.js';

type Entry = {
  key: string;
  users: number;
  used: number;
  controller: AbortController;
  retiring?: Promise<void>;
};
export type ResourceLease = { signal: AbortSignal; release: () => void };
type Waiting = {
  key: string;
  resolve: (lease: ResourceLease) => void;
  reject: (error: Error) => void;
  cleanup: () => void;
};

// Capacity belongs to panel lifetimes, not individual action invocations.
// Busy panels can share their lease; only idle panels are LRU candidates.
export class ResourcePool {
  private entries = new Map<string, Entry>();
  private waiting: Waiting[] = [];
  private clock = 0;
  private pumping = false;
  private rerun = false;
  private stopped = false;
  private limit: number;
  private dispose: (key: string) => Promise<void>;
  private onError: (error: unknown) => void;
  private maxWaiting: number;
  private waitMs: number;
  private retainIdle: boolean;
  constructor(
    limit: number,
    dispose: (key: string) => Promise<void>,
    onError: (error: unknown) => void,
    maxWaiting = 32,
    waitMs = 10000,
    retainIdle = true,
  ) {
    this.limit = limit;
    this.dispose = dispose;
    this.onError = onError;
    this.maxWaiting = maxWaiting;
    this.waitMs = waitMs;
    this.retainIdle = retainIdle;
  }
  get size() {
    return this.entries.size;
  }
  get queued() {
    return this.waiting.length;
  }
  acquire(key: string, signal?: AbortSignal): Promise<ResourceLease> {
    if (this.stopped) return Promise.reject(this.unavailable());
    if (signal?.aborted) return Promise.reject(this.abortError(signal));
    const entry = this.entries.get(key);
    if (entry && !entry.retiring) return Promise.resolve(this.lease(entry));
    if (this.waiting.length >= this.maxWaiting)
      return Promise.reject(new PaneonError('RUNTIME_BUSY', 'The runtime capacity queue is full.'));
    return new Promise((resolve, reject) => {
      const cancel = (error: Error) => {
        const index = this.waiting.indexOf(waiter);
        if (index === -1) return;
        this.waiting.splice(index, 1);
        waiter.cleanup();
        reject(error);
        this.pump();
      };
      const abort = () => cancel(signal ? this.abortError(signal) : this.unavailable());
      const timer = setTimeout(
        () => cancel(new PaneonError('RUNTIME_BUSY', 'Waiting for runtime capacity timed out.')),
        this.waitMs,
      );
      const waiter: Waiting = {
        key,
        resolve,
        reject,
        cleanup: () => {
          clearTimeout(timer);
          signal?.removeEventListener('abort', abort);
        },
      };
      signal?.addEventListener('abort', abort, { once: true });
      this.waiting.push(waiter);
      this.pump();
    });
  }
  private lease(entry: Entry): ResourceLease {
    entry.users++;
    entry.used = ++this.clock;
    let released = false;
    return {
      signal: entry.controller.signal,
      release: () => {
        if (released) return;
        released = true;
        entry.users--;
        entry.used = ++this.clock;
        if (!entry.users && !this.retainIdle)
          void this.retire(entry, this.unavailable()).catch(this.onError);
        this.pump();
      },
    };
  }
  private pump() {
    if (this.stopped) return;
    if (this.pumping) {
      this.rerun = true;
      return;
    }
    this.pumping = true;
    void this.drain()
      .catch(this.onError)
      .finally(() => {
        this.pumping = false;
        if (this.rerun) {
          this.rerun = false;
          this.pump();
        }
      });
  }
  private async drain() {
    while (this.waiting.length && !this.stopped) {
      const waiter = this.waiting[0];
      let entry = this.entries.get(waiter.key);
      if (entry?.retiring) {
        await entry.retiring;
        continue;
      }
      if (!entry && this.entries.size >= this.limit) {
        const idle = [...this.entries.values()]
          .filter((value) => !value.users && !value.retiring)
          .sort((a, b) => a.used - b.used)[0];
        if (!idle) return;
        await this.retire(idle, this.unavailable());
        continue;
      }
      if (!entry) {
        entry = { key: waiter.key, users: 0, used: 0, controller: new AbortController() };
        this.entries.set(waiter.key, entry);
      }
      this.waiting.shift();
      waiter.cleanup();
      waiter.resolve(this.lease(entry));
    }
  }
  private unavailable() {
    return new PaneonError('RUNTIME_UNAVAILABLE', 'The execution environment was retired.');
  }
  private abortError(signal: AbortSignal): Error {
    const reason: unknown = signal.reason;
    return reason instanceof Error ? reason : this.unavailable();
  }
  private retire(entry: Entry, error: Error): Promise<void> {
    if (entry.retiring) return entry.retiring;
    entry.retiring = Promise.resolve().then(async () => {
      await this.dispose(entry.key);
      this.entries.delete(entry.key);
      this.pump();
    });
    entry.controller.abort(error);
    return entry.retiring;
  }
  async remove(key: string, error: Error) {
    for (const waiter of [...this.waiting])
      if (waiter.key === key) {
        this.waiting.splice(this.waiting.indexOf(waiter), 1);
        waiter.cleanup();
        waiter.reject(error);
      }
    const entry = this.entries.get(key);
    if (entry) await this.retire(entry, error);
    this.pump();
  }
  async discardIdle(key: string) {
    const entry = this.entries.get(key);
    if (entry && !entry.users) await this.retire(entry, this.unavailable());
    this.pump();
  }
  async stop() {
    this.stopped = true;
    for (const waiter of this.waiting.splice(0)) {
      waiter.cleanup();
      waiter.reject(this.unavailable());
    }
    await Promise.all(
      [...this.entries.values()].map((entry) => this.retire(entry, this.unavailable())),
    );
  }
}
