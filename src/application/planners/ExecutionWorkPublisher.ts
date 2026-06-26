import type { StreamStatePlanningEvidence } from '../execution/types.js';

interface PlannerExecutionDispatchBase {
  readonly correlationId: string;
  readonly sourceTaskId: string;
  readonly sourceTaskName: string;
  readonly sourceEventId: string;
  readonly sourceQueueItemId: string;
  readonly tenantProcessId: string;
  readonly taskRef: string;
  readonly flowRef: string;
  readonly executionId: string;
  readonly requestId: string;
  readonly workType: string;
  readonly reason?: string;
}

export interface PlannerTaskActivationDispatch extends PlannerExecutionDispatchBase {
  readonly executionKind: 'task-activation';
  readonly flowParams: Record<string, unknown>;
}

export interface PlannerStreamFlowDispatch extends PlannerExecutionDispatchBase {
  readonly executionKind: 'stream-flow';
  readonly channelRef: string;
  readonly stoRef: string;
  readonly streamId: string;
  readonly planningEvidence: StreamStatePlanningEvidence;
}

export type PlannerExecutionDispatch = PlannerTaskActivationDispatch | PlannerStreamFlowDispatch;

export interface ExecutionWorkPublication {
  readonly id: string;
  readonly status: string;
}

export interface ExecutionWorkPublisher {
  publish(dispatch: PlannerExecutionDispatch): Promise<ExecutionWorkPublication>;
}
