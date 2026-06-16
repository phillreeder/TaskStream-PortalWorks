import type { RunRecord } from '../../domain/entities/execution.js';

export interface CreateRunInput {
  readonly streamId: string;
  readonly streamStateId: string;
  readonly stateVersion: number;
  readonly tenantProcessId: string;
  readonly tenantProcessKey: string;
  readonly tenantProcessVersion: string;
  readonly stoKey: string;
  readonly requestedAt: string;
}

export interface RunRepository {
  findByStateVersion(streamId: string, stoKey: string, stateVersion: number): Promise<RunRecord | undefined>;
  create(input: CreateRunInput): Promise<RunRecord>;
}
