import { watchFile, unwatchFile } from 'node:fs';
import path from 'node:path';
import type { RuntimeScaffold } from './RuntimeScaffold.js';
import type { FlatRuntimeControlExecutionResult } from './RuntimeScaffold.js';

export interface FlatRuntimeCommandWatcherOptions {
  readonly intervalMs?: number;
  readonly runImmediately?: boolean;
  readonly onResult?: (result: FlatRuntimeControlExecutionResult) => void | Promise<void>;
  readonly onError?: (error: unknown) => void | Promise<void>;
}

/**
 * Watches one command/control file. Touching or replacing that file selects
 * and executes the referenced flat-runtime config. Config files themselves
 * are deliberately not watched; the command file remains the explicit trigger.
 */
export class FlatRuntimeCommandWatcher {
  readonly commandPath: string;

  private readonly intervalMs: number;
  private readonly runImmediately: boolean;
  private readonly onResult?: FlatRuntimeCommandWatcherOptions['onResult'];
  private readonly onError?: FlatRuntimeCommandWatcherOptions['onError'];
  private started = false;
  private closed = false;
  private running = false;
  private pending = false;

  constructor(
    private readonly runtimeScaffold: RuntimeScaffold,
    commandPath: string,
    options: FlatRuntimeCommandWatcherOptions = {},
  ) {
    this.commandPath = path.resolve(commandPath);
    this.intervalMs = normalizeInterval(options.intervalMs);
    this.runImmediately = options.runImmediately ?? true;
    this.onResult = options.onResult;
    this.onError = options.onError;
  }

  start(): this {
    if (this.started) return this;
    this.started = true;
    watchFile(this.commandPath, { persistent: true, interval: this.intervalMs }, (current, previous) => {
      if (current.mtimeMs === previous.mtimeMs && current.size === previous.size) return;
      this.schedule();
    });
    if (this.runImmediately) this.schedule();
    return this;
  }

  async runNow(): Promise<FlatRuntimeControlExecutionResult> {
    return this.runtimeScaffold.executeFlatFromControlFile(this.commandPath);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    unwatchFile(this.commandPath);
  }

  private schedule(): void {
    if (this.closed) return;
    if (this.running) {
      this.pending = true;
      return;
    }
    void this.drain();
  }

  private async drain(): Promise<void> {
    this.running = true;
    try {
      do {
        this.pending = false;
        try {
          const result = await this.runNow();
          await this.onResult?.(result);
        } catch (error) {
          await this.onError?.(error);
        }
      } while (this.pending && !this.closed);
    } finally {
      this.running = false;
    }
  }
}

function normalizeInterval(value: number | undefined): number {
  if (value === undefined) return 500;
  if (!Number.isInteger(value) || value < 25) {
    throw new RangeError('Flat runtime command watcher intervalMs must be an integer of at least 25');
  }
  return value;
}
