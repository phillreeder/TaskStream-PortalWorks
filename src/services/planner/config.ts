import { resolve } from 'node:path';

export interface PlannerServiceConfig {
  readonly poolId: string;
  readonly concurrency: number;
  readonly pollIntervalMs: number;
  readonly databasePath: string;
  readonly tenantProcessRoot: string;
  readonly defaultTenantProcessId: string;
  readonly defaultTaskRef: string;
}

export function loadPlannerServiceConfig(
  environment: NodeJS.ProcessEnv = process.env,
): PlannerServiceConfig {
  return {
    poolId: environment.PLANNER_POOL_ID?.trim() || 'planner.default',
    concurrency: readPositiveInteger(environment.PLANNER_CONCURRENCY, 1, 'PLANNER_CONCURRENCY'),
    pollIntervalMs: readPositiveInteger(environment.PLANNER_POLL_INTERVAL_MS, 500, 'PLANNER_POLL_INTERVAL_MS'),
    databasePath: resolve(environment.PLANNER_DATABASE_PATH?.trim() || 'temp-infra/storage/IEBBeta/Test1/task-storage.sqlite'),
    tenantProcessRoot: resolve(environment.PLANNER_TENANT_PROCESS_ROOT?.trim() || 'Tenants'),
    defaultTenantProcessId: environment.PLANNER_DEFAULT_TENANT_PROCESS_ID?.trim() || 'TaskStream/Test1',
    defaultTaskRef: environment.PLANNER_DEFAULT_TASK_REF?.trim() || 'processWork',
  };
}

function readPositiveInteger(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}
