import type {
  ExecutionCompletion,
  ExecutionLease,
  ExecutionOutcome,
  ExecutionPoolId,
  ExecutionWork,
  ExecutionWorkerId,
  ExecutionWorkSubmission,
} from './types.js';

export interface ExecutionQueue {
  enqueue(submission: ExecutionWorkSubmission): Promise<ExecutionWork>;
  claim(input: {
    readonly workerId: ExecutionWorkerId;
    readonly poolId: ExecutionPoolId;
    readonly leaseSeconds: number;
  }): Promise<ExecutionLease | null>;
  complete(lease: ExecutionLease, completion: ExecutionCompletion): Promise<void>;
  retry(lease: ExecutionLease, outcome: Extract<ExecutionOutcome, { readonly status: 'retry' }>): Promise<void>;
  fail(lease: ExecutionLease, outcome: Extract<ExecutionOutcome, { readonly status: 'failed' }>): Promise<void>;
  release(lease: ExecutionLease, reason: string): Promise<void>;
}

export interface ExecutionService {
  execute(work: ExecutionWork): Promise<ExecutionOutcome>;
}

export interface ExecutionCompletionPublisher {
  publish(completion: ExecutionCompletion): Promise<void>;
}
