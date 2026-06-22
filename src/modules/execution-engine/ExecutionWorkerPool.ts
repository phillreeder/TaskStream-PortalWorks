import { randomUUID } from 'node:crypto';
import type {
  ExecutionCompletion,
  ExecutionCompletionPublisher,
  ExecutionPoolId,
  ExecutionQueue,
  ExecutionService,
} from '../../application/execution/index.js';
import { ExecutionWorker } from './ExecutionWorker.js';

export interface ExecutionWorkerPoolOptions {
  readonly poolId: ExecutionPoolId;
  readonly queue: ExecutionQueue;
  readonly executionService: ExecutionService;
  readonly completionPublisher?: ExecutionCompletionPublisher;
  readonly concurrency?: number;
  readonly pollIntervalMs?: number;
  readonly leaseSeconds?: number;
  readonly workerIdFactory?: (index: number) => string;
}

export class ExecutionWorkerPool {
  private readonly workers: ExecutionWorker[];
  private readonly pollIntervalMs: number;
  private running = false;
  private loops: Promise<void>[] = [];

  constructor(private readonly options: ExecutionWorkerPoolOptions) {
    const concurrency = options.concurrency ?? 1;
    if (!Number.isInteger(concurrency) || concurrency < 1) {
      throw new Error('ExecutionWorkerPool concurrency must be a positive integer.');
    }
    this.pollIntervalMs = options.pollIntervalMs ?? 250;
    this.workers = Array.from({ length: concurrency }, (_, index) => new ExecutionWorker({
      workerId: options.workerIdFactory?.(index) ?? `${options.poolId}-${index + 1}-${randomUUID()}`,
      poolId: options.poolId,
      queue: options.queue,
      executionService: options.executionService,
      completionPublisher: options.completionPublisher,
      leaseSeconds: options.leaseSeconds,
    }));
  }

  get poolId(): ExecutionPoolId {
    return this.options.poolId;
  }

  get size(): number {
    return this.workers.length;
  }

  async runAvailableOnce(): Promise<readonly ExecutionCompletion[]> {
    const completions = await Promise.all(this.workers.map((worker) => worker.runOnce()));
    return completions.filter((completion): completion is ExecutionCompletion => completion !== null);
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

  private async runLoop(worker: ExecutionWorker): Promise<void> {
    while (this.running) {
      try {
        const completion = await worker.runOnce();
        if (!completion) await this.sleep(this.pollIntervalMs);
      } catch {
        // A queue or publisher failure must not terminate the worker pool.
        await this.sleep(this.pollIntervalMs);
      }
    }
  }

  private async sleep(durationMs: number): Promise<void> {
    await new Promise<void>((resolve) => setTimeout(resolve, durationMs));
  }
}
