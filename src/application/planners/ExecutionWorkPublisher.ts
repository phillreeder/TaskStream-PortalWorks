import type { StreamStatePlanningEvidence } from '../execution/types.js';

export interface PlannerExecutionDispatch {
  readonly correlationId: string;
  readonly sourceTaskId: string;
  readonly sourceTaskName: string;
  readonly sourceEventId: string;
  readonly sourceQueueItemId: string;
  readonly tenantProcessId: string;
  readonly channelRef: string;
  readonly taskRef: string;
  readonly stoRef: string;
  readonly flowRef: string;
  readonly executionId: string;
  readonly requestId: string;
  readonly workType: string;
  readonly planningEvidence: StreamStatePlanningEvidence;
  readonly reason?: string;
  readonly flowParams?: Record<string, unknown>;
}

export interface ExecutionWorkPublication {
  readonly id: string;
  readonly status: string;
}

export interface ExecutionWorkPublisher {
  publish(dispatch: PlannerExecutionDispatch): Promise<ExecutionWorkPublication>;
}
