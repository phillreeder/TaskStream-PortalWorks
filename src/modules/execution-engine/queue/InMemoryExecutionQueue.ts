import { randomUUID } from 'node:crypto';
import type {
  ExecutionCompletion,
  ExecutionLease,
  ExecutionOutcome,
  ExecutionQueue,
  ExecutionWork,
  ExecutionWorkSubmission,
} from '../../../application/execution/index.js';

type QueueState = 'queued' | 'leased' | 'completed' | 'failed';

type StoredWork = {
  work: ExecutionWork;
  state: QueueState;
  lease?: ExecutionLease;
  completion?: ExecutionCompletion;
  failure?: Extract<ExecutionOutcome, { readonly status: 'failed' }>;
};

export class InMemoryExecutionQueue implements ExecutionQueue {
  private readonly entries = new Map<string, StoredWork>();

  constructor(private readonly now: () => Date = () => new Date()) {}

  async enqueue(submission: ExecutionWorkSubmission): Promise<ExecutionWork> {
    const createdAt = this.now().toISOString();
    const work: ExecutionWork = {
      id: submission.id ?? randomUUID(),
      queueId: submission.queueId,
      correlationId: submission.correlationId,
      payload: submission.payload,
      metadata: submission.metadata ?? {},
      createdAt,
      availableAt: submission.availableAt ?? createdAt,
      attemptCount: 0,
    };
    if (this.entries.has(work.id)) throw new Error(`Execution work already exists: ${work.id}`);
    this.entries.set(work.id, { work, state: 'queued' });
    return work;
  }

  async claim(input: { readonly workerId: string; readonly poolId: string; readonly leaseSeconds: number }): Promise<ExecutionLease | null> {
    const now = this.now();
    this.releaseExpiredLeases(now);
    const entry = [...this.entries.values()].find((candidate) =>
      candidate.state === 'queued' && new Date(candidate.work.availableAt).getTime() <= now.getTime());
    if (!entry) return null;

    const work = { ...entry.work, attemptCount: entry.work.attemptCount + 1 };
    const lease: ExecutionLease = {
      leaseId: randomUUID(),
      workerId: input.workerId,
      poolId: input.poolId,
      claimedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + input.leaseSeconds * 1000).toISOString(),
      work,
    };
    entry.work = work;
    entry.state = 'leased';
    entry.lease = lease;
    return lease;
  }

  async complete(lease: ExecutionLease, completion: ExecutionCompletion): Promise<void> {
    const entry = this.assertLease(lease);
    entry.state = 'completed';
    entry.completion = completion;
    delete entry.lease;
  }

  async retry(lease: ExecutionLease, outcome: Extract<ExecutionOutcome, { readonly status: 'retry' }>): Promise<void> {
    const entry = this.assertLease(lease);
    entry.state = 'queued';
    entry.work = { ...entry.work, availableAt: outcome.retryAt };
    delete entry.lease;
  }

  async fail(lease: ExecutionLease, outcome: Extract<ExecutionOutcome, { readonly status: 'failed' }>): Promise<void> {
    const entry = this.assertLease(lease);
    entry.state = 'failed';
    entry.failure = outcome;
    delete entry.lease;
  }

  async release(lease: ExecutionLease): Promise<void> {
    const entry = this.assertLease(lease);
    entry.state = 'queued';
    delete entry.lease;
  }

  snapshot(): readonly Readonly<StoredWork>[] {
    return [...this.entries.values()].map((entry) => ({ ...entry }));
  }

  private assertLease(lease: ExecutionLease): StoredWork {
    const entry = this.entries.get(lease.work.id);
    if (!entry || entry.state !== 'leased' || entry.lease?.leaseId !== lease.leaseId) {
      throw new Error(`Execution lease is no longer authoritative: ${lease.leaseId}`);
    }
    return entry;
  }

  private releaseExpiredLeases(now: Date): void {
    for (const entry of this.entries.values()) {
      if (entry.state === 'leased' && entry.lease && new Date(entry.lease.expiresAt).getTime() <= now.getTime()) {
        entry.state = 'queued';
        delete entry.lease;
      }
    }
  }
}
