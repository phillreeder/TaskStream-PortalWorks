import type { RunRecord } from '../../domain/entities/execution.ts';

export interface CreateRunInput {
  readonly streamId: string;
  readonly streamStateId: string;
  readonly stateVersion: number;
  readonly tenantProcessId: string;
  readonly tenantProcessKey: string;
  readonly tenantProcessVersion: string;
  readonly stoKey: string;
  readonly requestedAt: string;
  readonly metadata?: Record<string, unknown>;
}

export interface RunRepository {
  create(input: CreateRunInput): Promise<RunRecord>;
  findByStateVersion(streamId: string, stoKey: string, stateVersion: number): Promise<RunRecord | undefined>;
}
