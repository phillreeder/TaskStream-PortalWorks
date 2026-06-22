import type {
  ExecutionCompletion,
  ExecutionCompletionPublisher,
  ExecutionOutcome,
  ExecutionPoolId,
  ExecutionQueue,
  ExecutionService,
  ExecutionWorkerId,
} from '../../application/execution/index.js';

export interface ExecutionWorkerOptions {
  readonly workerId: ExecutionWorkerId;
  readonly poolId: ExecutionPoolId;
  readonly queue: ExecutionQueue;
  readonly executionService: ExecutionService;
  readonly completionPublisher?: ExecutionCompletionPublisher;
  readonly leaseSeconds?: number;
  readonly now?: () => Date;
}

export class ExecutionWorker {
  readonly workerId: ExecutionWorkerId;
  readonly poolId: ExecutionPoolId;

  private readonly leaseSeconds: number;
  private readonly now: () => Date;

  constructor(private readonly options: ExecutionWorkerOptions) {
    this.workerId = options.workerId;
    this.poolId = options.poolId;
    this.leaseSeconds = options.leaseSeconds ?? 30;
    this.now = options.now ?? (() => new Date());
  }

  async runOnce(): Promise<ExecutionCompletion | null> {
    const lease = await this.options.queue.claim({
      workerId: this.workerId,
      poolId: this.poolId,
      leaseSeconds: this.leaseSeconds,
    });
    if (!lease) return null;

    let outcome: ExecutionOutcome;
    try {
      outcome = await this.options.executionService.execute(lease.work);
    } catch (error) {
      outcome = {
        status: 'failed' as const,
        code: 'EXECUTION_SERVICE_THROWN',
        reason: error instanceof Error ? error.message : 'Execution service threw an unknown value.',
      };
    }

    const completion: ExecutionCompletion = {
      workId: lease.work.id,
      queueId: lease.work.queueId,
      poolId: this.poolId,
      workerId: this.workerId,
      correlationId: lease.work.correlationId,
      outcome,
      completedAt: this.now().toISOString(),
    };

    if (outcome.status === 'succeeded') {
      await this.options.queue.complete(lease, completion);
    } else if (outcome.status === 'retry') {
      await this.options.queue.retry(lease, outcome);
    } else {
      await this.options.queue.fail(lease, outcome);
    }

    await this.options.completionPublisher?.publish(completion);
    return completion;
  }
}
