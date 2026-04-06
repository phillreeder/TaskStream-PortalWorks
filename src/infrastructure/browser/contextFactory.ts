import type { Browser, BrowserContext, BrowserContextOptions, Page } from 'playwright';

export type ContextFactoryOptions = BrowserContextOptions;
export type CreateSessionOptions = BrowserContextOptions;

export interface ContextSession {
  readonly context: BrowserContext;
  readonly page: Page;
  close(): Promise<void>;
}

export class ContextFactory {
  private readonly defaults: ContextFactoryOptions;

  constructor(defaults: ContextFactoryOptions = {}) {
    this.defaults = defaults;
  }

  async create(browser: Browser, overrides: CreateSessionOptions = {}): Promise<ContextSession> {
    const context = await browser.newContext({ ...this.defaults, ...overrides });
    const page = await context.newPage();
    return new ManagedContext(context, page);
  }
}

class ManagedContext implements ContextSession {
  private closed = false;

  constructor(public readonly context: BrowserContext, public readonly page: Page) {}

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    try {
      if (!this.page.isClosed()) {
        await this.page.close();
      }
    } finally {
      await this.context.close();
    }
  }
}
