import type { ExecutionCompletionPublisher, ExecutionQueue } from '../../application/execution/index.js';
import { ModuleLink } from '../../modules/ModuleLink/index.js';
import {
  createExecutionWorkSubmissionRoute,
  ExecutionWorkerPool,
  FlowExecutionService,
  InMemoryExecutionQueue,
  UnavailableFlowExecutor,
  type FlowExecutor,
} from '../../modules/execution-engine/index.js';

export interface ExecutionWorkerMicroserviceOptions {
  readonly moduleLink?: ModuleLink;
  readonly queue?: ExecutionQueue;
  readonly flowExecutor?: FlowExecutor;
  readonly completionPublisher?: ExecutionCompletionPublisher;
  readonly poolId?: string;
  readonly concurrency?: number;
  readonly pollIntervalMs?: number;
}

export class ExecutionWorkerMicroservice {
  readonly moduleLink: ModuleLink;
  readonly queue: ExecutionQueue;
  readonly pool: ExecutionWorkerPool;

  constructor(options: ExecutionWorkerMicroserviceOptions = {}) {
    this.moduleLink = options.moduleLink ?? new ModuleLink();
    this.queue = options.queue ?? new InMemoryExecutionQueue();
    this.moduleLink.core.registerRoute(createExecutionWorkSubmissionRoute(this.queue));

    this.pool = new ExecutionWorkerPool({
      poolId: options.poolId ?? 'execution.default',
      queue: this.queue,
      executionService: new FlowExecutionService(options.flowExecutor ?? new UnavailableFlowExecutor()),
      completionPublisher: options.completionPublisher,
      concurrency: options.concurrency ?? 1,
      pollIntervalMs: options.pollIntervalMs,
    });
  }

  start(): void {
    this.pool.start();
  }

  stop(): Promise<void> {
    return this.pool.stop();
  }
}
