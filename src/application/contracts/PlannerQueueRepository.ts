import type { PlannerQueueRecord } from '../../domain/entities/execution.js';

export interface EnqueuePlannerIntentInput {
  readonly streamId: string;
  readonly stoId: string;
  readonly stoKey: string;
  readonly stoVersion: string;
  readonly tenantProcessId: string;
  readonly tenantProcessVersion: string;
  readonly runId: string;
}

export interface PlannerQueueRepository {
  enqueue(input: EnqueuePlannerIntentInput): Promise<PlannerQueueRecord>;
}
