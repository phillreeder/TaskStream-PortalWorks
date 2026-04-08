import type { PlannerQueueRecord } from '../../domain/entities/execution.ts';

export interface PlannerQueueCreateInput {
  readonly streamId: string;
  readonly stoId: string;
  readonly stoKey: string;
  readonly stoVersion: string;
  readonly tenantProcessId: string;
  readonly tenantProcessVersion: string;
  readonly runId: string;
  readonly payload?: Record<string, unknown>;
}

export interface PlannerQueueRepository {
  enqueue(input: PlannerQueueCreateInput): Promise<PlannerQueueRecord>;
}
