import type { PlannerWorkerPool } from '../../application/planners/PlannerWorkerPool.js';

export interface PlannerServiceResource {
  close(): void | Promise<void>;
}

export interface PlannerServiceOptions {
  readonly pool: PlannerWorkerPool;
  readonly validatedTenantProcessIds: readonly string[];
  readonly resources?: readonly PlannerServiceResource[];
}

export class PlannerService {
  readonly pool: PlannerWorkerPool;
  readonly validatedTenantProcessIds: readonly string[];

  private readonly resources: readonly PlannerServiceResource[];
  private stopping: Promise<void> | null = null;
  private stopped = false;

  constructor(options: PlannerServiceOptions) {
    this.pool = options.pool;
    this.validatedTenantProcessIds = options.validatedTenantProcessIds;
    this.resources = options.resources ?? [];
  }

  start(): void {
    if (this.stopped) throw new Error('PlannerService cannot restart after it has stopped.');
    this.pool.start();
  }

  async stop(): Promise<void> {
    if (this.stopping) return this.stopping;
    this.stopping = this.stopInternal();
    return this.stopping;
  }

  private async stopInternal(): Promise<void> {
    if (this.stopped) return;

    let firstError: unknown;
    try {
      await this.pool.stop();
    } catch (error) {
      firstError = error;
    }

    for (const resource of [...this.resources].reverse()) {
      try {
        await resource.close();
      } catch (error) {
        firstError ??= error;
      }
    }

    this.stopped = true;
    if (firstError !== undefined) throw firstError;
  }
}
