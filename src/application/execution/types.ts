import type { ExpectedStateChange, StateDependencyBlock, StatePath } from '../../modules/StreamState/index.js';

export type ExecutionWorkId = string;
export type ExecutionQueueId = string;
export type ExecutionPoolId = string;
export type ExecutionWorkerId = string;

export interface StreamStatePlanningEvidence {
  readonly streamKey: string;
  readonly planningContractId: string;
  readonly authoritativeVersion: number;
  readonly effectiveVersion: number;
  readonly stateSnapshot: Record<string, unknown>;
  readonly readablePaths: readonly StatePath[];
  readonly writablePaths: readonly StatePath[];
  readonly expectedChanges: readonly ExpectedStateChange[];
  readonly dependencyBlocks: readonly StateDependencyBlock[];
  readonly capturedAt: string;
}

export interface ExecutionWorkPayload {
  readonly tenantProcessId: string;
  readonly taskRef: string;
  readonly stoRef: string;
  readonly flowRef: string;
  readonly executionId: string;
  readonly input: Record<string, unknown>;
  readonly planningEvidence?: StreamStatePlanningEvidence;
}

export interface ExecutionWork {
  readonly id: ExecutionWorkId;
  readonly queueId: ExecutionQueueId;
  readonly correlationId: string;
  readonly payload: ExecutionWorkPayload;
  readonly metadata: Record<string, unknown>;
  readonly createdAt: string;
  readonly availableAt: string;
  readonly attemptCount: number;
}

export interface ExecutionWorkSubmission {
  readonly id?: ExecutionWorkId;
  readonly queueId: ExecutionQueueId;
  readonly correlationId: string;
  readonly payload: ExecutionWorkPayload;
  readonly metadata?: Record<string, unknown>;
  readonly availableAt?: string;
}

export interface ExecutionLease {
  readonly leaseId: string;
  readonly workerId: ExecutionWorkerId;
  readonly poolId: ExecutionPoolId;
  readonly claimedAt: string;
  readonly expiresAt: string;
  readonly work: ExecutionWork;
}

export type ExecutionOutcome =
  | {
      readonly status: 'succeeded';
      readonly result?: unknown;
      readonly metadata?: Record<string, unknown>;
    }
  | {
      readonly status: 'retry';
      readonly reason: string;
      readonly retryAt: string;
      readonly metadata?: Record<string, unknown>;
    }
  | {
      readonly status: 'failed';
      readonly reason: string;
      readonly code: string;
      readonly metadata?: Record<string, unknown>;
    };

export interface ExecutionCompletion {
  readonly workId: ExecutionWorkId;
  readonly queueId: ExecutionQueueId;
  readonly poolId: ExecutionPoolId;
  readonly workerId: ExecutionWorkerId;
  readonly correlationId: string;
  readonly outcome: ExecutionOutcome;
  readonly completedAt: string;
}
