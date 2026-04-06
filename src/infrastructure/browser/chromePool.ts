import { chromium, type Browser, type BrowserTypeLaunchOptions } from 'playwright';

export interface ChromePoolOptions {
  /** Maximum concurrent browser processes the pool can keep alive. */
  maxBrowsers?: number;
  /** Range of DevTools ports to allocate for each Chrome instance. */
  portRange?: { start: number; end: number };
  /** Additional launch options merged into each chromium.launch call. */
  launchOptions?: BrowserTypeLaunchOptions;
}

export interface ChromeLease {
  readonly id: number;
  readonly browser: Browser;
  readonly port: number;
  release(): Promise<void>;
  destroy(): Promise<void>;
}

type ChromeHandle = {
  id: number;
  browser: Browser;
  port: number;
  inUse: boolean;
  closed: boolean;
};

type PendingRequest = {
  resolve: (handle: ChromeHandle) => void;
  reject: (error: Error) => void;
};

const DEFAULT_MAX_BROWSERS = 2;
const DEFAULT_PORT_RANGE = { start: 9420, end: 9460 };
const DEFAULT_LAUNCH_ARGS = [
  '--disable-dev-shm-usage',
  '--no-first-run',
  '--no-default-browser-check',
];

export class ChromePool {
  private readonly maxBrowsers: number;
  private readonly portRange: { start: number; end: number };
  private readonly launchOptions: BrowserTypeLaunchOptions;
  private readonly handles = new Map<number, ChromeHandle>();
  private readonly pending: PendingRequest[] = [];
  private readonly usedPorts = new Set<number>();
  private shuttingDown = false;
  private idCounter = 0;
  private portCursor = 0;
  private pendingLaunches = 0;

  constructor(options: ChromePoolOptions = {}) {
    this.maxBrowsers = options.maxBrowsers ?? DEFAULT_MAX_BROWSERS;
    this.portRange = options.portRange ?? DEFAULT_PORT_RANGE;
    if (this.portRange.end < this.portRange.start) {
      throw new Error('ChromePool portRange.end must be >= portRange.start');
    }
    this.launchOptions = { headless: false, ...options.launchOptions };
  }

  async acquire(): Promise<ChromeLease> {
    if (this.shuttingDown) {
      throw new Error('ChromePool is shutting down');
    }

    const idle = this.getIdleHandle();
    if (idle) {
      idle.inUse = true;
      return this.wrapHandle(idle);
    }

    if (this.handles.size + this.pendingLaunches < this.maxBrowsers) {
      this.pendingLaunches += 1;
      try {
        const handle = await this.launchBrowser();
        return this.wrapHandle(handle);
      } finally {
        this.pendingLaunches -= 1;
      }
    }

    return new Promise<ChromeLease>((resolve, reject) => {
      this.pending.push({
        resolve: (handle) => resolve(this.wrapHandle(handle)),
        reject,
      });
    });
  }

  async shutdown(): Promise<void> {
    if (this.shuttingDown) return;
    this.shuttingDown = true;
    this.rejectAllPending(new Error('ChromePool has been shut down'));

    const closing: Promise<void>[] = [];
    for (const handle of this.handles.values()) {
      closing.push(this.closeHandle(handle));
    }

    await Promise.allSettled(closing);
    this.handles.clear();
    this.usedPorts.clear();
  }

  private getIdleHandle(): ChromeHandle | undefined {
    for (const handle of this.handles.values()) {
      if (!handle.inUse && !handle.closed) {
        return handle;
      }
    }
    return undefined;
  }

  private wrapHandle(handle: ChromeHandle): ChromeLease {
    const lease: ChromeLease = {
      id: handle.id,
      browser: handle.browser,
      port: handle.port,
      release: () => this.release(handle.id),
      destroy: () => this.destroy(handle.id),
    };
    return lease;
  }

  private async launchBrowser(): Promise<ChromeHandle> {
    if (this.shuttingDown) {
      throw new Error('ChromePool is shutting down');
    }

    const port = this.allocatePort();
    const args = [...DEFAULT_LAUNCH_ARGS, ...(this.launchOptions.args ?? []), `--remote-debugging-port=${port}`];
    const browser = await chromium.launch({ ...this.launchOptions, args });

    const handle: ChromeHandle = {
      id: ++this.idCounter,
      browser,
      port,
      inUse: true,
      closed: false,
    };

    browser.on('disconnected', () => {
      this.onBrowserDisconnect(handle.id);
    });

    this.handles.set(handle.id, handle);
    return handle;
  }

  private async release(id: number): Promise<void> {
    const handle = this.handles.get(id);
    if (!handle || handle.closed || !handle.inUse) {
      return;
    }

    const pendingRequest = this.pending.shift();
    if (pendingRequest) {
      pendingRequest.resolve(handle);
      return;
    }

    handle.inUse = false;
  }

  private async destroy(id: number): Promise<void> {
    const handle = this.handles.get(id);
    if (!handle) {
      return;
    }
    await this.closeHandle(handle);
    this.maybeSpinUpForPending();
  }

  private async closeHandle(handle: ChromeHandle): Promise<void> {
    if (handle.closed) {
      return;
    }
    handle.closed = true;
    this.handles.delete(handle.id);
    this.usedPorts.delete(handle.port);
    try {
      await handle.browser.close();
    } catch (error) {
      // Swallow to keep shutdown resilient; upstream callers can inspect logs.
      console.warn('Failed to close Chrome instance', error);
    }
  }

  private onBrowserDisconnect(id: number) {
    const handle = this.handles.get(id);
    if (!handle) {
      return;
    }
    this.closeHandle(handle).finally(() => this.maybeSpinUpForPending());
  }

  private maybeSpinUpForPending() {
    if (this.pending.length === 0 || this.shuttingDown) {
      return;
    }
    if (this.handles.size + this.pendingLaunches >= this.maxBrowsers) {
      return;
    }

    this.pendingLaunches += 1;
    this.launchBrowser()
      .then((handle) => {
        const request = this.pending.shift();
        if (request) {
          request.resolve(handle);
        } else {
          handle.inUse = false;
        }
      })
      .catch((error) => {
        this.rejectAllPending(error instanceof Error ? error : new Error(String(error)));
      })
      .finally(() => {
        this.pendingLaunches -= 1;
      });
  }

  private rejectAllPending(error: Error) {
    while (this.pending.length > 0) {
      const request = this.pending.shift();
      request?.reject(error);
    }
  }

  private allocatePort(): number {
    const { start, end } = this.portRange;
    const total = end - start + 1;
    for (let i = 0; i < total; i += 1) {
      const candidate = start + ((this.portCursor + i) % total);
      if (!this.usedPorts.has(candidate)) {
        this.usedPorts.add(candidate);
        this.portCursor = (candidate - start + 1) % total;
        return candidate;
      }
    }
    throw new Error('ChromePool has exhausted the configured debug port range');
  }
}
