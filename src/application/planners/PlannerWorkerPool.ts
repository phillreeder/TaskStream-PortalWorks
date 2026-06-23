import { randomUUID } from 'node:crypto';
import type { PersistentQueueItem } from '../task-storage/index.js';

export interface PlannerWorkConsumer {
  readonly workerId: string;
  runOnce(): Promise<PersistentQueueItem | null>;
}

export interface PlannerWorkerPoolOptions {
  readonly poolId: string;
  readonly workerFactory: (workerId: string, index: number) => PlannerWorkConsumer;
  readonly concurrency?: number;
  readonly pollIntervalMs?: number;
  readonly workerIdFactory?: (index: number) => string;
  readonly onWorkerError?: (error: unknown, workerId: string) => void;
}

export class PlannerWorkerPool {
  private readonly workers: readonly PlannerWorkConsumer[];
  private readonly pollIntervalMs: number;
  private running = false;
  private loops: Promise<void>[] = [];

  constructor(private readonly options: PlannerWorkerPoolOptions) {
    const concurrency = options.concurrency ?? 1;
    if (!Number.isInteger(concurrency) || concurrency < 1) {
      throw new Error('PlannerWorkerPool concurrency must be a positive integer.');
    }

    this.pollIntervalMs = options.pollIntervalMs ?? 500;
    if (!Number.isInteger(this.pollIntervalMs) || this.pollIntervalMs < 1) {
      throw new Error('PlannerWorkerPool pollIntervalMs must be a positive integer.');
    }

    this.workers = Array.from({ length: concurrency }, (_, index) => {
      const workerId = options.workerIdFactory?.(index)
        ?? `${options.poolId}-${index + 1}-${randomUUID()}`;
      return options.workerFactory(workerId, index);
    });
  }

  get poolId(): string {
    return this.options.poolId;
  }

  get size(): number {
    return this.workers.length;
  }

  async runAvailableOnce(): Promise<readonly PersistentQueueItem[]> {
    const results = await Promise.all(this.workers.map((worker) => worker.runOnce()));
    return results.filter((item): item is PersistentQueueItem => item !== null);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.loops = this.workers.map((worker) => this.runLoop(worker));
  }

  async stop(): Promise<void> {
    this.running = false;
    await Promise.all(this.loops);
    this.loops = [];
  }

  private async runLoop(worker: PlannerWorkConsumer): Promise<void> {
    while (this.running) {
      try {
        const item = await worker.runOnce();
        if (!item) await this.sleep(this.pollIntervalMs);
      } catch (error) {
        this.options.onWorkerError?.(error, worker.workerId);
        await this.sleep(this.pollIntervalMs);
      }
    }
  }

  private async sleep(durationMs: number): Promise<void> {
    await new Promise<void>((resolve) => setTimeout(resolve, durationMs));
  }
}
