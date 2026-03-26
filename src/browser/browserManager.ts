import type { Browser, BrowserContext, Page } from 'playwright';
import { ChromePool, type ChromeLease, type ChromePoolOptions } from './chromePool.js';
import {
  ContextFactory,
  type ContextFactoryOptions,
  type ContextSession,
  type CreateSessionOptions,
} from './contextFactory.js';

export interface BrowserManagerOptions {
  pool?: ChromePoolOptions;
  context?: ContextFactoryOptions;
}

export interface ManagedBrowserSession {
  readonly browser: Browser;
  readonly context: BrowserContext;
  readonly page: Page;
  readonly port: number;
  close(): Promise<void>;
  destroyBrowser(): Promise<void>;
}

export class BrowserManager {
  private readonly pool: ChromePool;
  private readonly contextFactory: ContextFactory;

  constructor(options: BrowserManagerOptions = {}) {
    this.pool = new ChromePool(options.pool);
    this.contextFactory = new ContextFactory(options.context);
  }

  async createSession(overrides?: CreateSessionOptions): Promise<ManagedBrowserSession> {
    const lease = await this.pool.acquire();
    try {
      const contextSession = await this.contextFactory.create(lease.browser, overrides);
      return new BrowserSession(lease, contextSession);
    } catch (error) {
      await lease.destroy();
      throw error;
    }
  }

  async withPage<T>(
    work: (session: ManagedBrowserSession) => Promise<T>,
    overrides?: CreateSessionOptions,
  ): Promise<T> {
    const session = await this.createSession(overrides);
    try {
      return await work(session);
    } finally {
      await session.close();
    }
  }

  async shutdown(): Promise<void> {
    await this.pool.shutdown();
  }
}

class BrowserSession implements ManagedBrowserSession {
  private closed = false;

  constructor(private readonly lease: ChromeLease, private readonly session: ContextSession) {}

  get browser(): Browser {
    return this.lease.browser;
  }

  get context(): BrowserContext {
    return this.session.context;
  }

  get page(): Page {
    return this.session.page;
  }

  get port(): number {
    return this.lease.port;
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    try {
      await this.session.close();
    } finally {
      await this.lease.release();
    }
  }

  async destroyBrowser(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    try {
      await this.session.close();
    } finally {
      await this.lease.destroy();
    }
  }
}
